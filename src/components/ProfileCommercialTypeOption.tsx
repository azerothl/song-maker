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
    <div className="profile-type-commercial-block">
      <div
        role="radio"
        aria-checked={selected}
        {...(state.activatable ? {} : { "aria-disabled": true })}
        aria-describedby={state.showUnavailableReason ? reasonId : undefined}
        tabIndex={0}
        data-testid="profile-type-commercial"
        className={`profile-type-card profile-type-commercial profile-focusable${selected ? " is-selected" : ""}${state.activatable ? "" : " is-inactive"}`}
        onClick={() => {
          if (state.activatable) onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (state.activatable) onSelect();
          }
        }}
      >
        <span className="profile-type-icon commercial" aria-hidden="true">
          💼
        </span>
        <span className="profile-type-label">{name}</span>
        <span className="profile-type-hint">{COMMERCIAL_PROFILE_DESCRIPTION_FR}</span>
        {state.showUnavailableReason ? (
          <p
            id={reasonId}
            className="profile-commercial-unavailable-reason"
            data-testid="profile-commercial-unavailable-reason"
          >
            <span className="profile-commercial-unavailable-icon" aria-hidden="true">
              i
            </span>
            {commercialUnavailableReasonFr()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
