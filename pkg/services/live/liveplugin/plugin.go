package liveplugin

import (
	"context"
	"fmt"

	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/plugins/plugincontext"
	"github.com/grafana/grafana/pkg/services/live/orgchannel"
	"github.com/grafana/grafana/pkg/services/live/pipeline"

	"github.com/centrifugal/centrifuge"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type ChannelLocalPublisher struct {
	node     *centrifuge.Node
	pipeline *pipeline.Pipeline
}

func NewChannelLocalPublisher(node *centrifuge.Node, pipeline *pipeline.Pipeline) *ChannelLocalPublisher {
	return &ChannelLocalPublisher{node: node, pipeline: pipeline}
}

func (p *ChannelLocalPublisher) PublishLocal(channel string, data []byte) error {
	orgID, channelID, err := orgchannel.StripOrgID(channel)
	if err != nil {
		return err
	}
	_, ok, err := p.pipeline.Get(orgID, channelID)
	if err != nil {
		return err
	}
	if ok {
		channelFrames, ok, err := p.pipeline.DataToChannelFrames(context.Background(), orgID, channelID, data)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("no conversion rule for a channel %s", channelID)
		}
		err = p.pipeline.ProcessChannelFrames(context.Background(), orgID, channelID, channelFrames)
		if err != nil {
			return fmt.Errorf("error processing frame: %v", err)
		}
		return nil
	}
	pub := &centrifuge.Publication{
		Data: data,
	}
	err = p.node.Hub().BroadcastPublication(channel, pub, centrifuge.StreamPosition{})
	if err != nil {
		return fmt.Errorf("error publishing %s: %w", string(data), err)
	}
	return nil
}

type NumLocalSubscribersGetter struct {
	node *centrifuge.Node
}

func NewNumLocalSubscribersGetter(node *centrifuge.Node) *NumLocalSubscribersGetter {
	return &NumLocalSubscribersGetter{node: node}
}

func (p *NumLocalSubscribersGetter) GetNumLocalSubscribers(channelID string) (int, error) {
	return p.node.Hub().NumSubscribers(channelID), nil
}

type ContextGetter struct {
	PluginContextProvider *plugincontext.Provider
}

func NewContextGetter(pluginContextProvider *plugincontext.Provider) *ContextGetter {
	return &ContextGetter{
		PluginContextProvider: pluginContextProvider,
	}
}

func (g *ContextGetter) GetPluginContext(user *models.SignedInUser, pluginID string, datasourceUID string, skipCache bool) (backend.PluginContext, bool, error) {
	return g.PluginContextProvider.Get(pluginID, datasourceUID, user, skipCache)
}
