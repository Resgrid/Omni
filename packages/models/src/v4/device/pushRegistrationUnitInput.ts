import { PushRegistrationInput } from './pushRegistrationInput';

/** Unit push registration (Core v4 `Devices/RegisterUnitDevice` binds the same `PushRegistrationInput` with `UnitId` set). */
export class PushRegistrationUnitInput extends PushRegistrationInput {
  public override UnitId: string = '';
}
