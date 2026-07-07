package frameworkapicheck

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jom-io/gorig/apix"
	"github.com/jom-io/gorig/global/consts"
	"github.com/jom-io/gorig/httpx"
	"github.com/jom-io/gorig/mid/tokenx"
)

func authRouter(t *testing.T, filter map[string]interface{}) (*gin.Engine, *tokenx.TokenService) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	svc := tokenx.Get(tokenx.Jwt, tokenx.Memory)
	_ = os.Remove("tokens.json")
	svc.Manager.CleanAll()
	t.Cleanup(func() {
		svc.Manager.CleanAll()
		_ = os.Remove("tokens.json")
	})

	router := gin.New()
	router.Use(func(ctx *gin.Context) {
		apix.SetTraceID(ctx)
		ctx.Next()
	})
	router.GET("/me", httpx.SignDef(), func(ctx *gin.Context) {
		if apix.GetUserID(ctx) == "" {
			t.Fatal("missing user id in gin context")
		}
		if ctx.Request.Context().Value(consts.UserIDKey) == nil {
			t.Fatal("missing user id in request context")
		}
		if ctx.Request.Context().Value(consts.TraceIDKey) == nil {
			t.Fatal("missing trace id in request context")
		}
		ctx.JSON(http.StatusOK, gin.H{
			"user_id": apix.GetUserID(ctx),
			"role":    apix.GetUserInfoValue(ctx, "role"),
			"token":   httpx.GetToken(ctx) != "",
		})
	})
	router.GET("/admin", httpx.SignUserDef(filter), func(ctx *gin.Context) {
		ctx.JSON(http.StatusOK, gin.H{"ok": true})
	})
	router.POST("/logout", httpx.SignDef(), func(ctx *gin.Context) {
		svc.Manager.Destroy(httpx.GetToken(ctx))
		ctx.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return router, svc
}

func bearer(token string) string {
	return "Bearer " + token
}

func requestWithToken(router http.Handler, method, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", bearer(token))
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func requestWithAuthHeader(router http.Handler, method, path, auth string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", auth)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestMemoryTokenMiddlewareAndLogoutFlow(t *testing.T) {
	router, svc := authRouter(t, map[string]interface{}{"role": "admin"})
	token, err := svc.Manager.GenerateAndRecord(context.Background(), "42", map[string]interface{}{"role": "admin"}, 3600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Manager.GenerateAndRecord(context.Background(), "sentinel", map[string]interface{}{"role": "sentinel"}, 3600); err != nil {
		t.Fatal(err)
	}

	w := requestWithToken(router, http.MethodGet, "/me", token)
	if w.Code != http.StatusOK {
		t.Fatalf("valid token status = %d, body = %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"user_id":"42"`) || !strings.Contains(w.Body.String(), `"role":"admin"`) {
		t.Fatalf("protected body missing user context: %s", w.Body.String())
	}

	w = requestWithToken(router, http.MethodGet, "/me", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("missing token status = %d, want 403", w.Code)
	}

	w = requestWithToken(router, http.MethodGet, "/me", "bad-token")
	if w.Code != http.StatusForbidden {
		t.Fatalf("short malformed token status = %d, want 403", w.Code)
	}

	w = requestWithAuthHeader(router, http.MethodGet, "/me", "Basic abcdefghijklmnopqrstuvwxyz")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("malformed auth scheme status = %d, want 400", w.Code)
	}

	w = requestWithToken(router, http.MethodPost, "/logout", token)
	if w.Code != http.StatusOK {
		t.Fatalf("logout status = %d, body = %s", w.Code, w.Body.String())
	}
	w = requestWithToken(router, http.MethodGet, "/me", token)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked token status = %d, want 401", w.Code)
	}
}

func TestMemoryTokenRefreshForbiddenAndExpiryChecks(t *testing.T) {
	router, svc := authRouter(t, map[string]interface{}{"role": "admin"})
	memberInfo := map[string]interface{}{"role": "member"}
	oldToken, err := svc.Manager.GenerateAndRecord(context.Background(), "77", memberInfo, 3600)
	if err != nil {
		t.Fatal(err)
	}

	w := requestWithToken(router, http.MethodGet, "/admin", oldToken)
	if w.Code != http.StatusForbidden {
		t.Fatalf("forbidden status = %d, want 403", w.Code)
	}

	time.Sleep(time.Second)
	newToken, err := svc.Generator.Generate("77", memberInfo, 3600)
	if err != nil {
		t.Fatal(err)
	}
	if newToken == oldToken {
		t.Fatal("expected a distinct refresh token")
	}
	if !svc.Manager.Refresh(oldToken, newToken) {
		t.Fatal("refresh returned false")
	}
	if _, ok := svc.Manager.GetUserID(oldToken); ok {
		t.Fatal("old token still resolves after refresh")
	}
	w = requestWithToken(router, http.MethodGet, "/me", newToken)
	if w.Code != http.StatusOK {
		t.Fatalf("new token status = %d, body = %s", w.Code, w.Body.String())
	}

	expired, err := svc.Generator.Generate("88", map[string]interface{}{"role": "admin"}, -1)
	if err != nil {
		t.Fatal(err)
	}
	if _, code := svc.Manager.IsNotExpired(expired, 0); code != consts.JwtTokenExpired {
		t.Fatalf("expired token code = %d, want %d", code, consts.JwtTokenExpired)
	}
	if svc.Manager.Record(expired, map[string]interface{}{"role": "admin"}) && svc.Manager.IsEffective(expired) {
		t.Fatal("expired token should not be effective")
	}
}

func TestCORSAndDebounceBehavior(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	httpx.SetOtherAllowHeaders("X-Tenant-ID")
	router.Use(httpx.CORS())
	router.OPTIONS("/cors", func(ctx *gin.Context) {})

	req := httptest.NewRequest(http.MethodOptions, "/cors", nil)
	req.Header.Set("Origin", "https://example.test")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://example.test" {
		t.Fatalf("allow origin = %q", got)
	}
	allowHeaders := strings.Join(w.Header().Values("Access-Control-Allow-Headers"), ",")
	if !strings.Contains(allowHeaders, "Authorization") || !strings.Contains(allowHeaders, "X-Tenant-ID") {
		t.Fatalf("allow headers missing expected values: %q", allowHeaders)
	}

	debounceRouter := gin.New()
	httpx.DebouceAw("/open")
	debounceRouter.Use(httpx.Debounce(500 * time.Millisecond))
	debounceRouter.GET("/limited", func(ctx *gin.Context) { ctx.String(http.StatusOK, "ok") })
	debounceRouter.GET("/open", func(ctx *gin.Context) { ctx.String(http.StatusOK, "ok") })

	req = httptest.NewRequest(http.MethodGet, "/limited?q=1", nil)
	w = httptest.NewRecorder()
	debounceRouter.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first debounce request status = %d", w.Code)
	}
	req = httptest.NewRequest(http.MethodGet, "/limited?q=1", nil)
	w = httptest.NewRecorder()
	debounceRouter.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("second debounce request status = %d, want 429", w.Code)
	}

	for i := 0; i < 2; i++ {
		req = httptest.NewRequest(http.MethodGet, "/open", nil)
		w = httptest.NewRecorder()
		debounceRouter.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("whitelisted debounce request %d status = %d", i, w.Code)
		}
	}
}

func TestOutboundHTTPHelpersAgainstLocalServer(t *testing.T) {
	type xmlResp struct {
		XMLName xml.Name `xml:"xml"`
		Status  string   `xml:"status"`
	}

	var receivedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/get":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"q":       r.URL.Query().Get("q"),
				"request": r.Header.Get("X-Request-ID"),
			})
		case "/form":
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			w.Write([]byte(r.Form.Get("name")))
		case "/json":
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"name": body["name"]})
		case "/ctx":
			receivedAuth = r.Header.Get("Authorization")
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		case "/xml":
			raw, _ := io.ReadAll(r.Body)
			if !bytes.Contains(raw, []byte("<id>7</id>")) {
				t.Fatalf("xml body = %s", raw)
			}
			w.Header().Set("Content-Type", "application/xml")
			w.Write([]byte("<xml><status>ok</status></xml>"))
		case "/bad-status":
			http.Error(w, "upstream failed", http.StatusInternalServerError)
		case "/bad-json":
			w.Write([]byte("{"))
		case "/slow":
			time.Sleep(200 * time.Millisecond)
			w.Write([]byte("slow"))
		case "/image.png":
			w.Header().Set("Content-Type", "image/png")
			w.Write([]byte("\x89PNG\r\n\x1a\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	body, err := httpx.GetHeader(server.URL+"/get", map[string]string{"q": "abc"}, map[string]string{"X-Request-ID": "trace-1"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, `"q":"abc"`) || !strings.Contains(body, `"request":"trace-1"`) {
		t.Fatalf("GET body = %s", body)
	}

	body, err = httpx.PostForm(server.URL+"/form", map[string]string{"name": "alice"})
	if err != nil || body != "alice" {
		t.Fatalf("PostForm body = %q err = %v", body, err)
	}

	data, err := httpx.PostJSON(server.URL+"/json", map[string]string{"name": "bob"})
	if err != nil {
		t.Fatal(err)
	}
	if data["name"] != "bob" {
		t.Fatalf("PostJSON data = %#v", data)
	}

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	ctx.Request.Header.Set("Authorization", "Bearer context-token")
	data, err = httpx.GetByCtx(ctx, server.URL+"/ctx", map[string]interface{}{"id": 1})
	if err != nil {
		t.Fatal(err)
	}
	if data["ok"] != "true" || receivedAuth != "Bearer context-token" {
		t.Fatalf("context forwarding data = %#v auth = %q", data, receivedAuth)
	}

	xmlBody, err := httpx.PostXML(server.URL+"/xml", map[string]string{"id": "7"})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := httpx.ParseXML[xmlResp](xmlBody)
	if err != nil || parsed.Status != "ok" {
		t.Fatalf("ParseXML parsed = %#v err = %v", parsed, err)
	}

	if _, err = httpx.PostJSONResp(server.URL+"/bad-status", map[string]string{"name": "bad"}); err == nil {
		t.Fatal("expected bad status error")
	}
	if got := httpx.ParseJSON("{"); got != nil {
		t.Fatalf("malformed JSON parsed as %#v, want nil", got)
	}

	httpx.SetTimeOutTmp(50 * time.Millisecond)
	if _, err = httpx.GetHeader(server.URL+"/slow", nil, nil); err == nil {
		t.Fatal("expected timeout error")
	}

	img, contentType, ext, err := httpx.FetchImage(server.URL + "/image.png")
	if err != nil {
		t.Fatal(err)
	}
	if len(img) == 0 || contentType != "image/png" || ext != ".png" {
		t.Fatalf("image len/content/ext = %d %q %q", len(img), contentType, ext)
	}
}
