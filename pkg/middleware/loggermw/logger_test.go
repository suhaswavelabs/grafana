package loggermw

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	contextmodel "github.com/grafana/grafana/pkg/services/contexthandler/model"
	"github.com/grafana/grafana/pkg/services/featuremgmt"
	"github.com/grafana/grafana/pkg/setting"
	"github.com/grafana/grafana/pkg/util/errutil"
	"github.com/grafana/grafana/pkg/web"
)

func Test_sanitizeURL(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		want        string
		expectError bool
	}{
		{
			name:  "Receiving empty string should return it",
			input: "",
			want:  "",
		},
		{
			name:  "Receiving valid URL string should return it parsed",
			input: "https://grafana.com/",
			want:  "https://grafana.com/",
		},
		{
			name:        "Receiving invalid URL string should return empty string",
			input:       "this is not a valid URL",
			want:        "",
			expectError: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, err := sanitizeURL(tt.input)
			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			assert.Equalf(t, tt.want, url, "sanitizeURL(%v)", tt.input)
		})
	}
}

func Test_prepareLog(t *testing.T) {
	type opts struct {
		Features      []any
		RouterLogging bool
	}

	grafanaFlavoredErr := errutil.NewBase(errutil.StatusNotFound, "test.notFound").Errorf("got error")

	tests := []struct {
		name     string
		opts     opts
		req      *http.Request
		response web.ResponseWriter
		duration time.Duration
		error    error

		expectFields  map[string]any
		expectAbsence map[string]struct{}
		expectedLevel errutil.LogLevel
	}{
		{
			name:     "base case",
			req:      mustRequest(http.NewRequest(http.MethodGet, "/", nil)),
			response: mockResponseWriter{},

			expectFields: map[string]any{
				"method":      "GET",
				"path":        "/",
				"status":      0,
				"remote_addr": "",
				"time_ms":     0,
				"duration":    "0s",
				"size":        0,
				"referer":     "",
			},
			expectAbsence: map[string]struct{}{
				"err":           {},
				"db_call_count": {},
			},
		},
		{
			name:     "base case",
			req:      mustRequest(http.NewRequest(http.MethodGet, "/", nil)),
			response: mockResponseWriter{},

			expectFields: map[string]any{
				"method":      "GET",
				"path":        "/",
				"status":      0,
				"remote_addr": "",
				"time_ms":     0,
				"duration":    "0s",
				"size":        0,
				"referer":     "",
			},
			expectAbsence: map[string]struct{}{
				"err":           {},
				"db_call_count": {},
			},
			expectedLevel: errutil.LevelInfo,
		},
		{
			name: "regular Go error",
			req:  mustRequest(http.NewRequest(http.MethodGet, "/", nil)),
			response: mockResponseWriter{
				status: http.StatusInternalServerError,
			},
			error: fmt.Errorf("got an error"),

			expectFields: map[string]any{
				"status": http.StatusInternalServerError,
				"err":    "got an error",
			},
			expectAbsence: map[string]struct{}{
				"errReason":    {},
				"errMessageID": {},
			},
			expectedLevel: errutil.LevelError,
		},
		{
			name: "Grafana-style error",
			req:  mustRequest(http.NewRequest(http.MethodGet, "/", nil)),
			response: mockResponseWriter{
				status: http.StatusNotFound,
			},
			error: grafanaFlavoredErr,
			expectFields: map[string]any{
				"status":       http.StatusNotFound,
				"err":          "got error",
				"errReason":    errutil.StatusNotFound,
				"errMessageID": "test.notFound",
			},
			expectedLevel: errutil.LevelInfo,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := setting.NewCfg()
			cfg.RouterLogging = tc.opts.RouterLogging
			l := Provide(cfg, featuremgmt.WithFeatures(tc.opts.Features...))

			service, ok := l.(*loggerImpl)
			require.Truef(t, ok, "expected service to be of type (*loggerImpl), got (%T)", l)

			c := &contextmodel.ReqContext{
				Context: &web.Context{
					Req:  tc.req,
					Resp: tc.response,
				},
				Error: tc.error,
			}

			logs, level := service.prepareLogParams(c, tc.duration)

			require.Zero(t, len(logs)%2, "Each key must have an accompanying value")
			kv := map[any]any{}
			for i := 0; i < len(logs); i += 2 {
				kv[logs[i]] = logs[i+1]
			}

			for key, val := range tc.expectFields {
				assert.Contains(t, kv, key)
				if val != nil {
					assert.EqualValues(t, val, kv[key])
				}
			}
			for key := range tc.expectAbsence {
				assert.NotContains(t, kv, key)
			}

			if tc.expectedLevel != "" {
				assert.Equal(t, tc.expectedLevel, level)
			}
		})
	}
}

func mustRequest(r *http.Request, err error) *http.Request {
	if err != nil {
		panic(fmt.Errorf("expected no error when creating request, got: %w", err))
	}
	return r
}

type mockResponseWriter struct {
	web.ResponseWriter

	status int
	size   int
}

func (m mockResponseWriter) Status() int {
	return m.status
}
func (m mockResponseWriter) Size() int {
	return m.size
}
