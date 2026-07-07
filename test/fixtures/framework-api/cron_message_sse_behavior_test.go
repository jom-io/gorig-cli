package frameworkapicheck

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jom-io/gorig/cache"
	"github.com/jom-io/gorig/cronx"
	"github.com/jom-io/gorig/httpx/ssex"
	"github.com/jom-io/gorig/mid/messagex"
	"github.com/jom-io/gorig/utils/errors"
)

func waitUntil(t *testing.T, timeout time.Duration, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("condition was not met within %s", timeout)
}

func TestCronxScheduledTaskBehavior(t *testing.T) {
	var intervalCount atomic.Int32
	intervalJob := func(ctx context.Context) {
		intervalCount.Add(1)
	}
	cronx.AddCronTask("@every 1s", intervalJob, time.Second)
	cronx.AddCronTask("@every 1s", intervalJob, time.Second)

	var everyCount atomic.Int32
	everyRegistered := make(chan struct{})
	go func() {
		cronx.AddEveryTask(time.Second, func(ctx context.Context) {
			everyCount.Add(1)
		}, time.Second)
		close(everyRegistered)
	}()
	select {
	case <-everyRegistered:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("AddEveryTask registration deadlocked")
	}

	var timeoutSeen atomic.Bool
	cronx.AddDelayTask(20*time.Millisecond, func(ctx context.Context) {
		select {
		case <-ctx.Done():
			timeoutSeen.Store(true)
		case <-time.After(200 * time.Millisecond):
		}
	}, 30*time.Millisecond)

	var onceCount atomic.Int32
	cronx.AddOnceTask(time.Now().Add(30*time.Millisecond), func(ctx context.Context) {
		onceCount.Add(1)
	}, time.Second)

	var afterPanic atomic.Bool
	cronx.AddDelayTask(40*time.Millisecond, func(ctx context.Context) {
		panic("expected test panic")
	})
	cronx.AddDelayTask(120*time.Millisecond, func(ctx context.Context) {
		afterPanic.Store(true)
	})

	if err := cronx.Startup("CRON", ""); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cronx.Shutdown("CRON", context.Background())
	})

	waitUntil(t, 3500*time.Millisecond, func() bool {
		return intervalCount.Load() >= 2 && everyCount.Load() >= 2 && timeoutSeen.Load() && onceCount.Load() == 1 && afterPanic.Load()
	})

	if got := intervalCount.Load(); got > 3 {
		t.Fatalf("duplicate cron registration appears active: interval count = %d, want <= 3", got)
	}
	if got := everyCount.Load(); got < 2 {
		t.Fatalf("AddEveryTask count = %d, want >= 2", got)
	}
	if got := onceCount.Load(); got != 1 {
		t.Fatalf("once task count = %d, want 1", got)
	}
}

type persistBadPayload struct {
	Ch chan int `json:"ch"`
}

func (persistBadPayload) PersistPayload() {}

func handlePersistBadPayload(ctx context.Context, payload persistBadPayload) error {
	return nil
}

type persistUnregisteredPayload struct {
	Value string `json:"value"`
}

func (persistUnregisteredPayload) PersistPayload() {}

func handlePersistUnregisteredPayload(ctx context.Context, payload persistUnregisteredPayload) error {
	return nil
}

var persistResult chan string

func handlePersistDelivery(ctx context.Context, payload persistPayload) error {
	persistResult <- payload.Value
	return nil
}

func TestCronxPersistentTaskValidation(t *testing.T) {
	if err := cronx.RegisterPersistTask(func(ctx context.Context, payload persistPayload) error {
		return nil
	}); err == nil || !strings.Contains(err.Error(), "named function") {
		t.Fatalf("anonymous RegisterPersistTask error = %v, want named-function error", err)
	}

	_, err := cronx.AddPersistDelayTask(time.Second, handlePersistUnregisteredPayload, persistUnregisteredPayload{Value: "pending"})
	if err == nil || !strings.Contains(err.Error(), "is not registered") {
		t.Fatalf("unregistered AddPersistDelayTask error = %v, want unregistered-handler error", err)
	}

	if err := cronx.RegisterPersistTask(handlePersistBadPayload); err != nil {
		t.Fatal(err)
	}
	_, err = cronx.AddPersistDelayTask(time.Second, handlePersistBadPayload, persistBadPayload{Ch: make(chan int)})
	if err == nil || !strings.Contains(err.Error(), "marshal persistent task payload") {
		t.Fatalf("bad payload AddPersistDelayTask error = %v, want marshal error", err)
	}

	if cache.GetRedisInstance[any](context.Background()) == nil {
		if err := cronx.RegisterPersistTask(handlePersistPayload); err != nil {
			t.Fatal(err)
		}
		_, err = cronx.AddPersistDelayTask(time.Second, handlePersistPayload, persistPayload{Value: "needs-redis"})
		if err == nil || !strings.Contains(err.Error(), "redis client is nil") {
			t.Fatalf("missing Redis AddPersistDelayTask error = %v, want redis client error", err)
		}
	}
}

func TestCronxPersistentDelayTaskIntegrationWhenRedisConfigured(t *testing.T) {
	redisCache := cache.GetRedisInstance[any](context.Background())
	if redisCache == nil || !redisCache.IsInitialized() {
		t.Skip("redis persistent cron storage is not configured")
	}
	cleanupPersistTaskKeys(t, redisCache)
	t.Cleanup(func() {
		cleanupPersistTaskKeys(t, redisCache)
		_ = cronx.Shutdown("CRON", context.Background())
	})

	persistResult = make(chan string, 1)
	if err := cronx.RegisterPersistTask(handlePersistDelivery); err != nil {
		t.Fatal(err)
	}
	_, err := cronx.AddPersistDelayTask(100*time.Millisecond, handlePersistDelivery, persistPayload{Value: "ok"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-persistResult:
		if got != "ok" {
			t.Fatalf("persistent payload = %q, want ok", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("persistent delay task did not execute")
	}
}

func cleanupPersistTaskKeys(t *testing.T, redisCache *cache.RedisCache[any]) {
	t.Helper()

	keys, err := redisCache.Client.Keys(context.Background(), "gorig:cronx:persist:*").Result()
	if err != nil {
		t.Fatalf("list persistent task keys failed: %v", err)
	}
	if len(keys) == 0 {
		return
	}
	if err := redisCache.Client.Del(context.Background(), keys...).Err(); err != nil {
		t.Fatalf("delete persistent task keys failed: %v", err)
	}
}

func TestMessagexLocalBrokerBehavior(t *testing.T) {
	topic := "fixture.local." + strings.NewReplacer("/", ".", " ", ".").Replace(t.Name())
	broker := messagex.Ins(messagex.Local)

	received := make(chan int64, 1)
	subID, err := broker.RegisterTopic(topic, func(msg *messagex.Message) *errors.Error {
		received <- msg.GetValueInt64("order_id")
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	broker.PublishNewMsg(context.Background(), topic, map[string]any{"order_id": int64(42)})
	select {
	case got := <-received:
		if got != 42 {
			t.Fatalf("received order_id = %d, want 42", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for local message")
	}
	if err := broker.UnRegisterTopic(topic, subID); err != nil {
		t.Fatal(err)
	}

	broker.PublishNewMsg(context.Background(), topic, map[string]any{"order_id": int64(99)})
	select {
	case got := <-received:
		t.Fatalf("received message after unsubscribe: %d", got)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestMessagexMultipleSubscribersReceiveEachMessage(t *testing.T) {
	topic := "fixture.multi." + strings.NewReplacer("/", ".", " ", ".").Replace(t.Name())
	broker := messagex.Ins(messagex.Local)

	var wg sync.WaitGroup
	wg.Add(2)
	ids := make([]uint64, 0, 2)
	for i := 0; i < 2; i++ {
		subID, err := broker.RegisterTopic(topic, func(msg *messagex.Message) *errors.Error {
			if msg.GetValueInt64("index") == 7 {
				wg.Done()
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, subID)
	}
	t.Cleanup(func() {
		for _, id := range ids {
			_ = broker.UnRegisterTopic(topic, id)
		}
	})

	broker.PublishNewMsg(context.Background(), topic, map[string]any{"index": int64(7)})
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("not all subscribers received the message")
	}
}

func TestMessagexSequentialRetryAndDLQBehavior(t *testing.T) {
	topic := "fixture.seq." + strings.NewReplacer("/", ".", " ", ".").Replace(t.Name())
	dlqTopic := topic + ".dead"
	broker := messagex.Ins(messagex.Local)

	dlqSeen := make(chan int64, 1)
	dlqID, err := broker.RegisterTopic(dlqTopic, func(msg *messagex.Message) *errors.Error {
		dlqSeen <- msg.GetValueInt64("index")
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer broker.UnRegisterTopic(dlqTopic, dlqID)

	orderCh := make(chan int64, 4)
	var failOnce atomic.Bool
	failOnce.Store(true)
	subID, err := broker.RegisterTopicSeq(topic, func(msg *messagex.Message) *errors.Error {
		index := msg.GetValueInt64("index")
		orderCh <- index
		if index == 1 && failOnce.Swap(false) {
			return errors.Sys("force retry")
		}
		if index == 9 {
			return errors.Sys("force dlq")
		}
		return nil
	}, messagex.WithMaxRetry(1), messagex.WithRetryIntervals(0), messagex.WithDLQTopic(dlqTopic))
	if err != nil {
		t.Fatal(err)
	}
	defer broker.UnRegisterTopic(topic, subID)

	for _, index := range []int64{0, 1, 2} {
		broker.PublishNewMsg(context.Background(), topic, map[string]any{"index": index})
	}
	var got []int64
	waitUntil(t, time.Second, func() bool {
		for len(got) < 4 {
			select {
			case next := <-orderCh:
				got = append(got, next)
			default:
				return false
			}
		}
		return true
	})
	if got[0] != 0 || got[1] != 1 {
		t.Fatalf("sequential order prefix = %v, want first published messages 0, 1", got)
	}
	var retryCount, twoCount int
	for _, value := range got {
		if value == 1 {
			retryCount++
		}
		if value == 2 {
			twoCount++
		}
	}
	if retryCount != 2 || twoCount != 1 {
		t.Fatalf("sequential retry order = %v, want one retry for 1 and one delivery for 2", got)
	}

	broker.PublishNewMsg(context.Background(), topic, map[string]any{"index": int64(9)})
	select {
	case got := <-dlqSeen:
		if got != 9 {
			t.Fatalf("dlq index = %d, want 9", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for local dlq delivery")
	}

	if err := broker.ReplayDLQ(topic, 1); err == nil || !strings.Contains(err.Error(), "store not initialized") {
		t.Fatalf("local ReplayDLQ error = %v, want store-not-initialized error", err)
	}
}

func TestSSEMiddlewareAndPayloads(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/events", ssex.Mid(), func(ctx *gin.Context) {
		if err := ssex.SendOK(ctx, "ready", map[string]any{"ok": true}); err != nil {
			t.Fatal(err)
		}
		if err := ssex.SendError(ctx, "ready", "not ready"); err != nil {
			t.Fatal(err)
		}
	})
	router.POST("/events", ssex.Mid(), func(ctx *gin.Context) {})

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	body := w.Body.String()
	if w.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("content-type = %q, want text/event-stream", ct)
	}
	for _, want := range []string{
		"event: ready",
		`"status":"ok"`,
		`"ok":true`,
		`"status":"error"`,
		`"message":"not ready"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("SSE body missing %q: %s", want, body)
		}
	}

	req = httptest.NewRequest(http.MethodPost, "/events", bytes.NewBuffer(nil))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 405", w.Code)
	}
	if got := strings.TrimSpace(w.Body.String()); got != `{"message":"Only GET method is allowed","status":"error"}` {
		t.Fatalf("POST body = %s", got)
	}
}

func TestMessageToSSECompositionCleanup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	topic := "fixture.sse." + strings.NewReplacer("/", ".", " ", ".").Replace(t.Name())
	broker := messagex.Ins(messagex.Local)
	cleaned := make(chan struct{}, 1)

	router := gin.New()
	router.GET("/stream", ssex.Mid(), func(ctx *gin.Context) {
		subID, err := broker.RegisterTopic(topic, func(msg *messagex.Message) *errors.Error {
			if sendErr := ssex.SendOK(ctx, "order.updated", msg.Content); sendErr != nil {
				return errors.Sys(sendErr.Error())
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		defer func() {
			_ = broker.UnRegisterTopic(topic, subID)
			cleaned <- struct{}{}
		}()

		broker.PublishNewMsg(context.Background(), topic, map[string]any{"order_id": int64(88)})
		time.Sleep(20 * time.Millisecond)
	})

	req := httptest.NewRequest(http.MethodGet, "/stream", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	body := w.Body.String()
	if !strings.Contains(body, "event: order.updated") || !strings.Contains(body, `"order_id":88`) {
		t.Fatalf("message-to-SSE body = %s", body)
	}
	select {
	case <-cleaned:
	case <-time.After(time.Second):
		t.Fatal("subscriber cleanup did not run")
	}
}

func TestRedisMessageBrokerIntegrationWhenConfigured(t *testing.T) {
	if cache.GetRedisInstance[*messagex.Message](context.Background()) == nil {
		t.Skip("redis message broker is not configured")
	}

	redisBroker := messagex.Ins(messagex.Redis)

	topic := fmt.Sprintf("fixture.redis.%d", time.Now().UnixNano())
	received := make(chan int64, 1)
	subID, err := redisBroker.RegisterTopic(topic, func(msg *messagex.Message) *errors.Error {
		received <- msg.GetValueInt64("index")
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer redisBroker.UnRegisterTopic(topic, subID)

	redisBroker.PublishNewMsg(context.Background(), topic, map[string]any{"index": int64(5)})
	select {
	case got := <-received:
		if got != 5 {
			t.Fatalf("redis message index = %d, want 5", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for redis message")
	}
}
