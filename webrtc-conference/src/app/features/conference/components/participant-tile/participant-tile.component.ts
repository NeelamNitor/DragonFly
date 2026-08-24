import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { Participant } from '../../../../core/models/participant.model';
import { ConnectionBadgeComponent } from '../connection-badge/connection-badge.component';

@Component({
  selector: 'app-participant-tile',
  imports: [ConnectionBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-tile.component.html',
  styleUrl: './participant-tile.component.scss',
})
export class ParticipantTileComponent {
  readonly participant = input.required<Participant>();

  protected readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  constructor() {
    effect(() => {
      const stream = this.participant().stream;
      const video = this.videoEl()?.nativeElement;
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
      }
    });
  }
}
