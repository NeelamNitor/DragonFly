import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, OnInit, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MediaDeviceService } from '../../../../core/services/media-device.service';
import { generateRoomCode } from '../../../../core/utils/id.util';
import { SessionPrefsService } from '../../../../shared/services/session-prefs.service';

@Component({
  selector: 'app-lobby',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent implements OnInit {
  protected readonly media = inject(MediaDeviceService);
  private readonly prefs = inject(SessionPrefsService);
  private readonly router = inject(Router);

  private readonly previewVideo = viewChild<ElementRef<HTMLVideoElement>>('previewVideo');

  protected readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    roomId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    effect(() => {
      const stream = this.media.localStream();
      const video = this.previewVideo()?.nativeElement;
      if (video) video.srcObject = stream;
    });
  }

  async ngOnInit(): Promise<void> {
    this.form.controls.displayName.setValue(this.prefs.displayName());
    this.form.controls.roomId.setValue(generateRoomCode());
    try {
      await this.media.initialize();
    } catch {
      // Error already surfaced to the user via NotificationService.
    }
  }

  protected regenerateRoomCode(): void {
    this.form.controls.roomId.setValue(generateRoomCode());
  }

  protected async onAudioDeviceChange(event: Event): Promise<void> {
    const deviceId = (event.target as HTMLSelectElement).value;
    if (deviceId) await this.media.switchDevice('audio', deviceId);
  }

  protected async onVideoDeviceChange(event: Event): Promise<void> {
    const deviceId = (event.target as HTMLSelectElement).value;
    if (deviceId) await this.media.switchDevice('video', deviceId);
  }

  protected async join(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, roomId } = this.form.getRawValue();
    this.prefs.setDisplayName(displayName);
    await this.router.navigate(['/room', roomId.trim().toLowerCase()]);
  }
}
