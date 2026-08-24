import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ConnectionQuality } from '../../../../core/models/connection-state.model';

const LABELS: Record<ConnectionQuality, string> = {
  excellent: 'Excellent connection',
  good: 'Good connection',
  fair: 'Fair connection',
  poor: 'Poor connection',
  unknown: 'Connecting…',
};

@Component({
  selector: 'app-connection-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" [class]="'dot--' + quality()" [title]="label()"></span>`,
  styles: [
    `
      .dot {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #8b949e;
      }
      .dot--excellent { background: #3fb950; }
      .dot--good { background: #56d364; }
      .dot--fair { background: #d29922; }
      .dot--poor { background: #f85149; }
      .dot--unknown { background: #8b949e; }
    `,
  ],
})
export class ConnectionBadgeComponent {
  readonly quality = input<ConnectionQuality>('unknown');
  protected readonly label = computed(() => LABELS[this.quality()]);
}
