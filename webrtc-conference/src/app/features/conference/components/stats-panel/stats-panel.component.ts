import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PeerCallStats } from '../../../../core/models/call-stats.model';
import { Participant } from '../../../../core/models/participant.model';
import { StatsMonitorService } from '../../../../core/services/stats-monitor.service';

interface StatsRow extends PeerCallStats {
  displayName: string;
}

@Component({
  selector: 'app-stats-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-panel.component.html',
  styleUrl: './stats-panel.component.scss',
})
export class StatsPanelComponent {
  readonly stats = input.required<Map<string, PeerCallStats>>();
  readonly participants = input.required<Participant[]>();

  protected readonly classify = StatsMonitorService.classifyQuality;

  protected readonly rows = computed<StatsRow[]>(() => {
    const names = new Map(this.participants().map((p) => [p.id, p.displayName]));
    return Array.from(this.stats().values()).map((s) => ({
      ...s,
      displayName: names.get(s.participantId) ?? s.participantId,
    }));
  });
}
