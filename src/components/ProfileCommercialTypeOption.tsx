import {
  COMMERCIAL_PROFILE_DESCRIPTION_FR,
  type CommercialCreationState,
} from "@song-maker/stem-providers";
import { commercialUnavailableReasonFr } from "../lib/profileCommercialCreation";

type Props = {
  state: CommercialCreationState;
  selected: boolean;
  onSelect: () => void;
  name: string;
};

export function ProfileCommercialTypeOption({
  state,
  selected,
  onSelect,
  name,
}: Props) {
  if (!state.showCommercialOption) {
    return null;
  }

  const reasonId = "profile-commercial-unavailable-reason";

  return (
    <label
      data-testid="profile-type-commercial"
      className={`profile-type-card profile-type-commercial${selected ? " is-selected" : ""}${state.activatable ? "" : " is-inactive"}`}
    >
      <input
        className="profile-type-radio"
        type="radio"
        name="profile-kind"
        value="commercial"
        checked={selected}
        disabled={!state.activatable}
        aria-describedby={state.showUnavailableReason ? reasonId : undefined}
        onChange={onSelect}
      />
      <span className="profile-type-label">{name}</span>
      <span className="profile-type-hint">{COMMERCIAL_PROFILE_DESCRIPTION_FR}</span>
      {state.showUnavailableReason ? (
        <span
          id={reasonId}
          className="profile-commercial-unavailable-reason"
          data-testid="profile-commercial-unavailable-reason"
        >
          <span className="profile-commercial-unavailable-icon" aria-hidden="true">
            i
          </span>
          {commercialUnavailableReasonFr()}
        </span>
      ) : null}
    </label>
  );
}
