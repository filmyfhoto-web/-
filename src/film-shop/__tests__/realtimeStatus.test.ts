import { describe, it, expect, beforeEach } from 'vitest';
import {
  reportChannelStatus,
  unregisterChannel,
  getRealtimeState,
  getLastSyncedAt,
  onGlobalRefresh,
  requestGlobalRefresh,
} from '@/film-shop/lib/realtimeStatus';

describe('realtime status', () => {
  beforeEach(() => {
    ['a', 'b'].forEach(unregisterChannel);
  });

  it('reports connecting with no channels', () => {
    expect(getRealtimeState()).toBe('connecting');
  });

  it('is connected when any channel is subscribed', () => {
    reportChannelStatus('a', 'CHANNEL_ERROR');
    reportChannelStatus('b', 'SUBSCRIBED');
    expect(getRealtimeState()).toBe('connected');
    expect(getLastSyncedAt()).toBeTypeOf('number');
  });

  it('is offline when all channels failed', () => {
    reportChannelStatus('a', 'CHANNEL_ERROR');
    reportChannelStatus('b', 'TIMED_OUT');
    expect(getRealtimeState()).toBe('offline');
  });

  it('global refresh notifies subscribers', async () => {
    let hits = 0;
    const off = onGlobalRefresh(() => { hits += 1; });
    await requestGlobalRefresh();
    off();
    await requestGlobalRefresh();
    expect(hits).toBe(1);
  });
});
