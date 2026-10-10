export type PhotoControls = Readonly<{
  fieldOfView: number;
  height: number;
  grid: boolean;
  showStaff: boolean;
  controlsHidden: boolean;
}>;

export type PhotoSnapshot = PhotoControls &
  Readonly<{
    mouseLook: boolean;
    saving: boolean;
    message: string;
    failed: boolean;
  }>;

export interface PhotoModeActions {
  updatePhotoControls(controls: Partial<PhotoControls>): void;
  resetPhotoCamera(): void;
  capturePhoto(): Promise<void>;
  enablePhotoMouseLook(): Promise<void>;
  exitPhotoMode(): void;
}
