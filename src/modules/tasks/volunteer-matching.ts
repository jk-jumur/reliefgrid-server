import { ObjectId } from "mongodb";

import { HttpError } from "../../utils/http-error.js";
import type { VolunteerDocument } from "../volunteers/volunteer.model.js";

type IdentifiedVolunteer = VolunteerDocument & { _id: ObjectId };

export interface VolunteerMatchResult {
  volunteers: VolunteerDocument[];
  matchedSkills: string[];
}

export const matchAvailableVolunteers = (
  profiles: VolunteerDocument[],
  requiredSkills: string[],
  volunteerCount: number
): VolunteerMatchResult => {
  const required = requiredSkills.map((skill) => skill.trim().toLocaleLowerCase());
  const uncovered = new Set(required);
  const candidates = profiles.filter(
    (profile): profile is IdentifiedVolunteer =>
      profile._id instanceof ObjectId &&
      profile.availability === "available" &&
      profile.skills.some((skill) => required.includes(skill.trim().toLocaleLowerCase()))
  );
  const selected: VolunteerDocument[] = [];
  const selectedIds = new Set<string>();

  while (selected.length < volunteerCount) {
    const ranked = candidates
      .filter((candidate) => !selectedIds.has(candidate._id.toHexString()))
      .map((candidate) => {
        const skills = new Set(
          candidate.skills.map((skill) => skill.trim().toLocaleLowerCase())
        );
        const newlyCovered = [...uncovered].filter((skill) => skills.has(skill));
        const totalMatched = required.filter((skill) => skills.has(skill)).length;
        return { candidate, newlyCovered, totalMatched };
      })
      .filter(({ newlyCovered, totalMatched }) =>
        uncovered.size > 0 ? newlyCovered.length > 0 : totalMatched > 0
      )
      .sort((first, second) =>
        second.newlyCovered.length - first.newlyCovered.length ||
        second.totalMatched - first.totalMatched ||
        first.candidate._id.toHexString().localeCompare(
          second.candidate._id.toHexString()
        )
      );
    const match = ranked[0];
    if (!match) {
      throw new HttpError(
        409,
        "Not enough available, skill-matched volunteers to fill this task"
      );
    }

    selected.push(match.candidate);
    selectedIds.add(match.candidate._id.toHexString());
    match.newlyCovered.forEach((skill) => uncovered.delete(skill));
  }

  if (uncovered.size > 0) {
    throw new HttpError(
      409,
      `Available volunteers cannot cover all required skills: ${[...uncovered].join(", ")}`
    );
  }

  return {
    volunteers: selected,
    matchedSkills: requiredSkills.map((skill) => skill.trim()),
  };
};
