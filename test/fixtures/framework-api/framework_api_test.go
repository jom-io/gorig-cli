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
	"github.com/jom-io/gorig/serv"
	"github.com/jom-io/gorig/utils/errors"
	"github.com/jom-io/gorig/utils/logger"
	"github.com/jom-io/gorig/utils/sys"
	"go.uber.org/zap"
)

type order struct {
	UserID int64  `bson:"user_id" json:"user_id"`
	Status string `bson:"status" json:"status"`
}

func (*order) DConfig() (domainx.ConType, string, string) {
	return domainx.Mongo, "main", "order"
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

func compileCache() {
	_ = cache.New[order](cache.Memory, time.Minute, time.Minute)
	_ = cache.New[order](cache.JSON, "orders")
	_ = cache.New[order](cache.Sqlite, "orders")
	_ = cache.New[order](cache.Redis)
}

func compileCron() {
	cronx.AddCronTask("0 */5 * * * *", func(ctx context.Context) {
		logger.Info(ctx, "scheduled sync")
	}, 30*time.Second)
}

func compileMessaging(ctx context.Context) {
	broker := messagex.Ins(messagex.Local)
	subID, err := broker.RegisterTopic("order.created", func(msg *messagex.Message) *errors.Error {
		return nil
	})
	if err == nil {
		defer broker.UnRegisterTopic("order.created", subID)
	}
	broker.PublishNewMsg(ctx, "order.created", map[string]any{"order_id": int64(1)})
}

func compileLogging(ctx context.Context) {
	logger.Info(ctx, "order created", zap.Int64("order_id", 1))
}

func TestFrameworkExamplesCompile(t *testing.T) {
	// Compilation is the assertion. Runtime behavior belongs to its roadmap phase.
}
