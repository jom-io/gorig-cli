package frameworkapicheck

import (
	"context"
	stderrs "errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jom-io/gorig/cache"
)

func enterTempCacheDir(t *testing.T) string {
	t.Helper()

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(cwd)
	})
	return tmp
}

func cacheName(t *testing.T) string {
	return strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
}

func TestMemoryCacheBehavior(t *testing.T) {
	c := cache.New[order](cache.Memory, 20*time.Millisecond, 10*time.Millisecond)
	if c == nil || !c.IsInitialized() {
		t.Fatal("memory cache is not initialized")
	}

	if _, err := c.Get("missing"); !stderrs.Is(err, cache.ErrCacheMiss) {
		t.Fatalf("missing key error = %v, want cache miss", err)
	}

	item := order{UserID: 1, Status: "pending"}
	if err := c.Set("order:1", item, time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := c.Get("order:1")
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != item.UserID || got.Status != item.Status {
		t.Fatalf("got %+v, want %+v", got, item)
	}

	exists, err := c.Exists("order:1")
	if err != nil || !exists {
		t.Fatalf("exists = %v, %v; want true, nil", exists, err)
	}
	if err := c.Del("order:1"); err != nil {
		t.Fatal(err)
	}
	exists, err = c.Exists("order:1")
	if err != nil || exists {
		t.Fatalf("exists after delete = %v, %v; want false, nil", exists, err)
	}

	if err := c.Set("short", item, 20*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	exists, err = c.Exists("short")
	if err != nil || exists {
		t.Fatalf("exists after expiry = %v, %v; want false, nil", exists, err)
	}

	counter := cache.New[int64](cache.Memory, time.Minute, time.Minute)
	next, err := counter.Incr("order.counter")
	if err != nil || next != 1 {
		t.Fatalf("first increment = %d, %v; want 1, nil", next, err)
	}
	next, err = counter.Incr("order.counter")
	if err != nil || next != 2 {
		t.Fatalf("second increment = %d, %v; want 2, nil", next, err)
	}

	if err := c.RPush("order.queue", item); err != nil {
		t.Fatal(err)
	}
	queued, err := c.BRPop(100*time.Millisecond, "order.queue")
	if err != nil {
		t.Fatal(err)
	}
	if queued.UserID != item.UserID {
		t.Fatalf("queued item = %+v, want user_id %d", queued, item.UserID)
	}

	if err := c.Set("flush", item, time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := c.Flush(); err != nil {
		t.Fatal(err)
	}
	exists, err = c.Exists("flush")
	if err != nil || exists {
		t.Fatalf("exists after flush = %v, %v; want false, nil", exists, err)
	}
}

func TestJSONCacheBehavior(t *testing.T) {
	tmp := enterTempCacheDir(t)
	name := cacheName(t)
	c := cache.New[order](cache.JSON, name)
	if c == nil || !c.IsInitialized() {
		t.Fatal("json cache is not initialized")
	}

	item := order{UserID: 2, Status: "json"}
	if err := c.Set("order:2", item, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, ".cache", name+".cache.json")); err != nil {
		t.Fatal(err)
	}

	reopened := cache.New[order](cache.JSON, name)
	got, err := reopened.Get("order:2")
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != item.UserID || got.Status != item.Status {
		t.Fatalf("got %+v, want %+v", got, item)
	}

	if err := reopened.Del("order:2"); err != nil {
		t.Fatal(err)
	}
	exists, err := reopened.Exists("order:2")
	if err != nil || exists {
		t.Fatalf("exists after delete = %v, %v; want false, nil", exists, err)
	}

	if err := reopened.Set("short", item, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(2 * time.Second)
	exists, err = reopened.Exists("short")
	if err != nil || exists {
		t.Fatalf("exists after expiry = %v, %v; want false, nil", exists, err)
	}
}

func TestSQLiteCacheBehavior(t *testing.T) {
	tmp := enterTempCacheDir(t)
	name := cacheName(t)
	c := cache.New[order](cache.Sqlite, name)
	if c == nil || !c.IsInitialized() {
		t.Fatal("sqlite cache is not initialized")
	}

	item := order{UserID: 3, Status: "sqlite"}
	if err := c.Set("order:3", item, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, ".cache", name+".db")); err != nil {
		t.Fatal(err)
	}

	got, err := c.Get("order:3")
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != item.UserID || got.Status != item.Status {
		t.Fatalf("got %+v, want %+v", got, item)
	}

	if err := c.Del("order:3"); err != nil {
		t.Fatal(err)
	}
	exists, err := c.Exists("order:3")
	if err != nil || exists {
		t.Fatalf("exists after delete = %v, %v; want false, nil", exists, err)
	}

	if err := c.Set("short", item, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(2 * time.Second)
	exists, err = c.Exists("short")
	if err != nil || exists {
		t.Fatalf("exists after expiry = %v, %v; want false, nil", exists, err)
	}
}

func TestMultiLevelCacheSingleflight(t *testing.T) {
	l1 := cache.New[order](cache.Memory, time.Minute, time.Minute)
	l2 := cache.New[order](cache.Memory, time.Minute, time.Minute)
	var loads atomic.Int64

	tool := cache.NewCacheTool[order](context.Background(), []cache.Cache[order]{l1, l2}, func(key string) (order, error) {
		loads.Add(1)
		time.Sleep(30 * time.Millisecond)
		return order{UserID: 4, Status: key}, nil
	})

	warm := order{UserID: 5, Status: "warm"}
	if err := l2.Set("warm", warm, time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := tool.Get("warm", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != warm.UserID || loads.Load() != 0 {
		t.Fatalf("lower-layer hit got %+v, loads %d; want warm, 0", got, loads.Load())
	}
	if _, err := l1.Get("warm"); err != nil {
		t.Fatalf("expected lower-layer hit to backfill l1: %v", err)
	}
	if err := tool.Delete("warm"); err != nil {
		t.Fatal(err)
	}
	for _, layer := range []cache.Cache[order]{l1, l2} {
		exists, err := layer.Exists("warm")
		if err != nil || exists {
			t.Fatalf("exists after multi-level delete = %v, %v; want false, nil", exists, err)
		}
	}

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := tool.Get("cold", time.Minute)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if loads.Load() != 1 {
		t.Fatalf("loader calls = %d, want 1", loads.Load())
	}
}
