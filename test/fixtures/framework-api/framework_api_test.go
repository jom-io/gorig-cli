package frameworkapicheck

import (
	"context"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jom-io/gorig/apix"
	"github.com/jom-io/gorig/cache"
	"github.com/jom-io/gorig/cronx"
	"github.com/jom-io/gorig/domainx"
	"github.com/jom-io/gorig/domainx/dx"
	"github.com/jom-io/gorig/global/consts"
	"github.com/jom-io/gorig/httpx"
	"github.com/jom-io/gorig/httpx/ssex"
	"github.com/jom-io/gorig/mid/messagex"
	"github.com/jom-io/gorig/mid/tokenx"
	"github.com/jom-io/gorig/serv"
	"github.com/jom-io/gorig/utils/errors"
	"github.com/jom-io/gorig/utils/logger"
	"github.com/jom-io/gorig/utils/sys"
	"github.com/qiniu/qmgo"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type order struct {
	UserID    int64    `bson:"user_id" json:"user_id"`
	Status    string   `bson:"status" json:"status"`
	Tags      []string `bson:"tags" json:"tags"`
	Lat       float64  `bson:"lat" json:"lat"`
	Lng       float64  `bson:"lng" json:"lng"`
	Amount    float64  `bson:"amount" json:"amount"`
	CreatedAt int64    `bson:"created_at" json:"created_at"`
}

func (*order) DConfig() (domainx.ConType, string, string) {
	return domainx.Mongo, "main", "order"
}

type persistPayload struct {
	Value string `json:"value"`
}

func (persistPayload) PersistPayload() {}

func handlePersistPayload(ctx context.Context, payload persistPayload) error {
	return nil
}

func hello(ctx *gin.Context) {
	defer apix.HandlePanic(ctx)
	name, err := apix.GetParamType[string](ctx, "name", apix.NotForce, "world")
	if err != nil {
		return
	}
	result := map[string]string{"message": "hello " + name}
	apix.HandleData(ctx, consts.CurdSelectFailCode, result, nil)
}

func compileRoutes() {
	httpx.RegisterRouter(func(root *gin.RouterGroup) {
		root.GET("/hello", hello)
		root.GET("/events", ssex.Mid(), func(ctx *gin.Context) {
			_ = ssex.SendOK(ctx, "update", map[string]any{"ready": true})
		})
	})
}

func compileLifecycle() {
	err := serv.RegisterService(serv.Service{
		Code: "WORKER",
		Startup: func(code, port string) error {
			return nil
		},
		Shutdown: func(code string, ctx context.Context) error {
			return nil
		},
	})
	if err != nil {
		sys.Exit(err)
	}
}

func compileData(ctx context.Context) {
	value := order{UserID: 1, Status: "pending"}
	id, err := dx.On(ctx, &value).Save()
	if err != nil {
		return
	}
	_, _ = dx.On[order](ctx).WithID(id).Get()
	_, _ = dx.On[order](ctx).Eq("status", value.Status).Sort("id").Find()
	_ = dx.On[order](ctx).WithID(id).Update("status", "done")
	_ = dx.On[order](ctx).WithID(id).Delete()
}

func compileAdvancedData(ctx context.Context) {
	matches := domainx.NewMatches().
		Eq("user_id", int64(1)).
		Ne("status", "deleted").
		Gte("created_at", int64(100)).
		Lt("created_at", int64(200)).
		Like("status", "pend").
		In("status", []string{"pending", "done"}).
		NotIn("status", []string{"archived"}).
		Has("tags", "hot").
		HasAny("tags", []string{"vip", "trial"}).
		HasAll("tags", []string{"paid", "verified"}).
		NEmpty("status")

	_, _ = dx.On[order](ctx).
		AddMatches(matches).
		Select("id", "status", "created_at").
		Omit("secret").
		Sort("created_at", true).
		Find()

	_, _ = dx.On[order](ctx).Eq("status", "active").Count()
	_, _ = dx.On[order](ctx).Eq("status", "active").Exists()
	_, _ = dx.On[order](ctx).Eq("user_id", int64(1)).Sum("amount")
	_, _ = dx.On[order](ctx).Eq("user_id", int64(1)).Sort("id").Page(1, 20, 0)

	_ = dx.On[order](ctx).Eq("user_id", int64(1)).FindEach(func(item *domainx.Complex[order]) *errors.Error {
		return nil
	})
	_ = dx.On[order](ctx).Eq("user_id", int64(1)).AllEach(func(item *domainx.Complex[order]) *errors.Error {
		return nil
	})
	_, _ = dx.On[order](ctx).Near("lat", "lng", 30.0, 120.0, 3000).Find()
	_, _ = dx.On[order](ctx).NearLoc("location", 30.0, 120.0, 3000).Find()

	raw, err := dx.On[order](ctx).Complex().GetCon().MustGetDB()
	if err == nil {
		_, _ = raw.(*gorm.DB)
		_, _ = raw.(*qmgo.Client)
	}
}

func compileCache() {
	memory := cache.New[order](cache.Memory, time.Minute, time.Minute)
	_ = cache.New[order](cache.JSON, "orders")
	_ = cache.New[order](cache.Sqlite, "orders")
	_ = cache.New[order](cache.Redis)
	_ = memory.Set("order:1", order{UserID: 1}, time.Minute)
	_, _ = memory.Get("order:1")
	_, _ = memory.Exists("order:1")
	_ = memory.Expire("order:1", time.Minute)
	_ = memory.RPush("order.queue", order{UserID: 1})
	_, _ = memory.BRPop(time.Millisecond, "order.queue")
	_ = memory.Del("order:1")
	_ = memory.Flush()

	counter := cache.New[int64](cache.Memory, time.Minute, time.Minute)
	_, _ = counter.Incr("order.counter")

	l1 := cache.New[order](cache.Memory, time.Minute, time.Minute)
	l2 := cache.New[order](cache.Memory, time.Minute, time.Minute)
	tool := cache.NewCacheTool[order](context.Background(), []cache.Cache[order]{l1, l2}, func(key string) (order, error) {
		return order{Status: key}, nil
	})
	_, _ = tool.Get("order:2", time.Minute)
	_ = tool.Set("order:2", order{UserID: 2}, time.Minute)
	_ = tool.Delete("order:2")

	_, _ = cache.NewSQLiteCachePage[order]("orders_page")
}

func compileCron() {
	cronx.AddCronTask("0 */5 * * * *", func(ctx context.Context) {
		logger.Info(ctx, "scheduled sync")
	}, 30*time.Second)
	cronx.AddEveryTask(5*time.Minute, func(ctx context.Context) {
		logger.Info(ctx, "interval sync")
	}, 30*time.Second)
	cronx.AddDelayTask(time.Second, func(ctx context.Context) {
		logger.Info(ctx, "delayed sync")
	}, 30*time.Second)
	cronx.AddOnceTask(time.Now().Add(time.Hour), func(ctx context.Context) {
		logger.Info(ctx, "one-shot sync")
	}, 30*time.Second)
	_ = cronx.RegisterPersistTask(handlePersistPayload)
	_, _ = cronx.AddPersistDelayTask(time.Minute, handlePersistPayload, persistPayload{Value: "delay"}, 30*time.Second)
	_, _ = cronx.AddPersistOnceTask(time.Now().Add(time.Hour), handlePersistPayload, persistPayload{Value: "once"}, 30*time.Second)
}

func compileMessaging(ctx context.Context) {
	broker := messagex.Ins(messagex.Local)
	subID, err := broker.RegisterTopic("order.created", func(msg *messagex.Message) *errors.Error {
		return nil
	})
	if err == nil {
		defer broker.UnRegisterTopic("order.created", subID)
	}
	seqID, err := broker.RegisterTopicSeq("order.project", func(msg *messagex.Message) *errors.Error {
		return nil
	}, messagex.WithMaxRetry(3), messagex.WithRetryIntervals(time.Second))
	if err == nil {
		defer broker.UnRegisterTopic("order.project", seqID)
	}
	broker.PublishNewMsg(ctx, "order.created", map[string]any{"order_id": int64(1)})
	_ = broker.ReplayDLQ("order.project", 10)
}

func compileAuthAndOutbound(ctx *gin.Context) {
	svc := tokenx.Get(tokenx.Jwt, tokenx.Memory)
	token, err := svc.Manager.GenerateAndRecord(ctx, "1", map[string]interface{}{"role": "admin"}, 3600)
	if err != nil {
		return
	}
	_ = svc.Manager.IsMeetRefresh(token)
	_ = svc.Manager.IsEffective(token)
	svc.Manager.Destroy(token)
	svc.Manager.Clean("1")

	group := gin.New().Group("/account")
	group.GET("/me", httpx.SignDef(), func(ctx *gin.Context) {})
	group.GET("/admin", httpx.SignUserDef(map[string]interface{}{"role": "admin"}), func(ctx *gin.Context) {})
	group.Use(httpx.CORS(), httpx.Debounce(200*time.Millisecond))

	_, _ = httpx.Get("http://127.0.0.1", map[string]string{"q": "abc"})
	_, _ = httpx.GetHeader("http://127.0.0.1", nil, map[string]string{"X-Request-ID": "trace-test"})
	_, _ = httpx.PostForm("http://127.0.0.1", map[string]string{"name": "demo"})
	_, _ = httpx.PostJSONResp("http://127.0.0.1", map[string]string{"name": "demo"})
	_, _ = httpx.PostJSONRespHeader("http://127.0.0.1", map[string]string{"name": "demo"}, map[string]string{"X-Request-ID": "trace-test"})
	_, _ = httpx.PostXML("http://127.0.0.1", map[string]string{"id": "1"})
	_, _, _, _ = httpx.FetchImage("http://127.0.0.1/image.png")
}

func compileLogging(ctx context.Context) {
	logger.Info(ctx, "order created", zap.Int64("order_id", 1))
}

func TestFrameworkExamplesCompile(t *testing.T) {
	// Compilation is the assertion. Runtime behavior belongs to its roadmap phase.
}
