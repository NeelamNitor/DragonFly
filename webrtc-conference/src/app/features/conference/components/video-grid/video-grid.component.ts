import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Participant } from '../../../../core/models/participant.model';
import { ParticipantTileComponent } from '../participant-tile/participant-tile.component';

@Component({
  selector: 'app-video-grid',
  imports: [ParticipantTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-grid.component.html',
  styleUrl: './video-grid.component.scss',
})
export class VideoGridComponent {
  readonly participants = input.required<Participant[]>();

  /** Column count chosen so tiles stay roughly 16:9 for common room sizes. */
  protected readonly columns = computed(() => {
    const n = this.participants().length;
    if (n <= 1) return 1;
    if (n <= 2) return 2;
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    if (n <= 9) return 3;
    return 4;
  });
}
