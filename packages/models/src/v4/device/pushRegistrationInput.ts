/**
 * Registers this device's push token (Core v4 `Devices/RegisterDevice` for a user subscriber,
 * `Devices/RegisterUnitDevice` for a unit subscriber). `Source` tells Core which app/subject the
 * registration belongs to (push `Source` values are permanent per variant); `UnitId` is set for unit registrations.
 */
export class PushRegistrationInput {
  public Platform: number = 0;
  public Token: string = '';
  public UnitId?: string;
  public DeviceUuid: string = '';
  public Prefix: string = '';
  public Source?: string;
}
