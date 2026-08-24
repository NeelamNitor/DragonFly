export interface MediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
}

export const DEFAULT_MEDIA_STATE: MediaState = {
  audioEnabled: true,
  videoEnabled: true,
  screenSharing: false,
};
