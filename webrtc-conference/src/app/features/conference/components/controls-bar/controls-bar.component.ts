import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SignalingStatus } from '../../../../core/models/connection-state.model';

@Component({
  selector: 'app-controls-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './controls-bar.component.html',
  styleUrl: './controls-bar.component.scss',
})
export class ControlsBarComponent {
  readonly audioEnabled = input.required<boolean>();
  readonly videoEnabled = input.required<boolean>();
  readonly isScreenSharing = input.required<boolean>();
  readonly isStatsPanelOpen = input.required<boolean>();
  readonly signalingStatus = input.required<SignalingStatus>();
  readonly participantCount = input.required<number>();

  readonly toggleAudio = output<void>();
  readonly toggleVideo = output<void>();
  readonly toggleScreenShare = output<void>();
  readonly toggleStats = output<void>();
  readonly leave = output<void>();
}
