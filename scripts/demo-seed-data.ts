import { faker } from "@faker-js/faker";
import { ObjectId } from "mongodb";

import type { EmergencyRequestDocument } from "../src/modules/emergency-requests/emergency-request.model.js";
import { calculateEmergencyRequestPriority } from "../src/modules/emergency-requests/emergency-request.priority.js";
import type { IncidentDocument } from "../src/modules/incidents/incident.model.js";
import { calculateIncidentPriority } from "../src/modules/incidents/incident.priority.js";
import type { OrganizationDocument } from "../src/modules/organizations/organization.model.js";
import type { ResourceDocument, ResourceCategory } from "../src/modules/resources/resource.model.js";
import { calculateResourceAvailability } from "../src/modules/resources/resource.inventory.js";
import type { ShelterDocument } from "../src/modules/shelters/shelter.model.js";
import type { VolunteerDocument } from "../src/modules/volunteers/volunteer.model.js";

export const DEMO_DATA_COUNTS = {
  organizations: 5,
  incidents: 50,
  emergencyRequests: 100,
  shelters: 20,
  volunteers: 100,
  resources: 500,
} as const;

export interface DemoIdentity {
  id: string;
  name: string;
  email: string;
}

export interface DemoSeedContext {
  seed: number;
  generatedAt: Date;
  systemAdmin: DemoIdentity;
  coordinator: DemoIdentity;
  citizen: DemoIdentity;
  shelterManager: DemoIdentity;
  organizationIds: string[];
  organizationUsers: DemoIdentity[];
  volunteerUsers: DemoIdentity[];
}

type GeneratedDocument<T> = T & { dataOrigin: "generated_demo" };

export interface DemoDataset {
  organizations: GeneratedDocument<OrganizationDocument>[];
  incidents: GeneratedDocument<IncidentDocument>[];
  emergencyRequests: GeneratedDocument<EmergencyRequestDocument>[];
  shelters: GeneratedDocument<ShelterDocument>[];
  volunteers: GeneratedDocument<VolunteerDocument>[];
  resources: GeneratedDocument<ResourceDocument>[];
}

const resourceCategories: ResourceCategory[] = [
  "food_packages",
  "drinking_water",
  "medical_supplies",
  "emergency_kits",
  "blankets",
  "rescue_equipment",
  "transportation_resources",
];

const locations = [
  "Sylhet",
  "Sunamganj",
  "Kurigram",
  "Cox's Bazar",
  "Chattogram",
  "Rangpur",
  "Netrokona",
  "Barisal",
  "Feni",
  "Dhaka",
];

const locationRisk = ["low", "medium", "high", "critical"] as const;
const incidentCategories = [
  "flood",
  "cyclone",
  "earthquake",
  "fire",
  "landslide",
  "infrastructure_failure",
] as const;
const severities = ["low", "medium", "high", "critical"] as const;
const requestTypes = [
  "food",
  "drinking_water",
  "medical_supply",
  "shelter",
  "rescue",
  "transportation",
] as const;
const volunteerSkills = [
  "first aid",
  "search and rescue",
  "logistics",
  "water sanitation",
  "communications",
  "shelter support",
  "driving",
  "translation",
];
const facilities = [
  "clean water",
  "first aid",
  "accessible washrooms",
  "family sleeping area",
  "kitchen",
  "backup power",
];

const pickCoordinates = () => ({
  latitude: Number(faker.number.float({ min: 20.7, max: 26.6, fractionDigits: 5 })),
  longitude: Number(faker.number.float({ min: 88.0, max: 92.7, fractionDigits: 5 })),
});

const pickLocation = () => {
  const place = faker.helpers.arrayElement(locations);
  return `${faker.location.streetAddress()}, ${place}, Bangladesh`;
};

const withDemoOrigin = <T>(record: T): GeneratedDocument<T> => ({
  ...record,
  dataOrigin: "generated_demo",
});

const historyTimestamp = (base: Date, minuteOffset: number, ceiling: Date): Date =>
  new Date(Math.min(base.getTime() + minuteOffset * 60_000, ceiling.getTime()));

export const generateDemoDataset = (context: DemoSeedContext): DemoDataset => {
  if (
    context.organizationUsers.length !== DEMO_DATA_COUNTS.organizations ||
    context.organizationIds.length !== DEMO_DATA_COUNTS.organizations ||
    context.volunteerUsers.length !== DEMO_DATA_COUNTS.volunteers
  ) {
    throw new Error("Demo seed context does not contain the required account counts");
  }
  faker.seed(context.seed);

  const organizations = context.organizationUsers.map((user, index) => {
    const now = context.generatedAt;
    return withDemoOrigin<OrganizationDocument>({
      _id: context.organizationIds[index],
      name: `${faker.company.name()} Relief Network`,
      description: faker.lorem.sentence(),
      region: faker.helpers.arrayElement(locations),
      status: "active",
      history: [{
        action: "organization_created",
        timestamp: now,
        changedBy: context.systemAdmin.id,
        details: "Generated demo organization",
      }],
      createdBy: context.systemAdmin.id,
      createdAt: new Date(now.getTime() - (index + 1) * 86_400_000),
      updatedAt: now,
    });
  });

  const incidentIds = Array.from(
    { length: DEMO_DATA_COUNTS.incidents },
    () => new ObjectId()
  );
  const incidents = incidentIds.map((id, index) => {
    const createdAt = faker.date.recent({ days: 90, refDate: context.generatedAt });
    const severity = faker.helpers.arrayElement(severities);
    const risk = faker.helpers.arrayElement(locationRisk);
    const affectedPopulation = faker.number.int({ min: 0, max: 2400 });
    const { score, priority } = calculateIncidentPriority(
      severity,
      affectedPopulation,
      risk,
      createdAt,
      context.generatedAt
    );
    const status = faker.helpers.arrayElement([
      "reported",
      "under_review",
      "verified",
      "in_progress",
    ] as const);
    const reporter = index % 4 === 0
      ? context.organizationUsers[index % context.organizationUsers.length]
      : context.citizen;
    const organization = reporter === context.citizen
      ? null
      : organizations[index % organizations.length];
    const category = faker.helpers.arrayElement(incidentCategories);
    const history: IncidentDocument["incidentHistory"] = [{
      action: "incident_reported",
      status: "reported",
      priority,
      timestamp: createdAt,
      changedBy: reporter.id,
      details: ["Generated demo incident"],
    }];
    const incidentProgression = ["reported", "under_review", "verified", "in_progress"] as const;
    const currentIncidentStage = incidentProgression.indexOf(status);
    for (const nextStatus of incidentProgression.slice(1, currentIncidentStage + 1)) {
      history.push({
        action: "status_changed",
        status: nextStatus,
        priority,
        timestamp: historyTimestamp(createdAt, history.length * 20, context.generatedAt),
        changedBy: context.coordinator.id,
        details: [`Demo incident moved to ${nextStatus}`],
      });
    }

    return withDemoOrigin<IncidentDocument>({
      _id: id,
      title: `${category.replaceAll("_", " ")} response needed`,
      description: faker.lorem.sentences({ min: 1, max: 3 }),
      category,
      location: pickLocation(),
      coordinates: pickCoordinates(),
      locationRisk: risk,
      severity,
      affectedPopulation,
      priority,
      priorityScore: score,
      priorityOverridden: false,
      status,
      assignedCoordinator: status === "reported" || status === "under_review"
        ? null
        : context.coordinator.id,
      reportedBy: reporter.id,
      organizationId: organization?._id ?? null,
      incidentHistory: history,
      createdAt,
      updatedAt: history.at(-1)?.timestamp ?? createdAt,
    });
  });

  const emergencyRequests = Array.from(
    { length: DEMO_DATA_COUNTS.emergencyRequests },
    (_, index) => {
      const submittedAt = faker.date.recent({ days: 60, refDate: context.generatedAt });
      const requestType = faker.helpers.arrayElement(requestTypes);
      const urgency = faker.helpers.arrayElement(severities);
      const risk = faker.helpers.arrayElement(locationRisk);
      const affectedPeople = faker.number.int({ min: 1, max: 1800 });
      const { score, priority } = calculateEmergencyRequestPriority(
        urgency,
        requestType,
        affectedPeople,
        risk,
        submittedAt,
        context.generatedAt
      );
      const status = faker.helpers.arrayElement([
        "pending",
        "under_review",
        "verified",
        "assigned",
      ] as const);
      const organization = index % 3 === 0
        ? organizations[index % organizations.length]
        : null;
      const requester = organization
        ? context.organizationUsers[index % context.organizationUsers.length]
        : context.citizen;
      const assignedOrganization = status === "assigned"
        ? organizations[(index + 1) % organizations.length]
        : null;
      const history: EmergencyRequestDocument["requestHistory"] = [{
        action: "request_submitted",
        status: "pending",
        priority,
        timestamp: submittedAt,
        changedBy: requester.id,
        details: ["Generated demo emergency request"],
      }];
      const requestProgression = ["pending", "under_review", "verified", "assigned"] as const;
      const currentRequestStage = requestProgression.indexOf(status);
      for (const nextStatus of requestProgression.slice(1, currentRequestStage + 1)) {
        history.push({
          action: "status_changed",
          status: nextStatus,
          priority,
          timestamp: historyTimestamp(submittedAt, history.length * 20, context.generatedAt),
          changedBy: context.coordinator.id,
          details: [`Demo request moved to ${nextStatus}`],
        });
      }

      return withDemoOrigin<EmergencyRequestDocument>({
        _id: new ObjectId(),
        requestType,
        requiredQuantity: faker.number.int({ min: 5, max: 900 }),
        location: pickLocation(),
        coordinates: pickCoordinates(),
        locationRisk: risk,
        urgency,
        affectedPeople,
        description: faker.lorem.sentences({ min: 1, max: 3 }),
        incidentId: faker.datatype.boolean({ probability: 0.7 })
          ? incidentIds[index % incidentIds.length].toHexString()
          : null,
        requestedBy: requester.id,
        organizationId: organization?._id ?? null,
        assignedOrganizationId: assignedOrganization?._id ?? null,
        assignedCoordinator: assignedOrganization ? context.coordinator.id : null,
        priority,
        priorityScore: score,
        priorityOverridden: false,
        status,
        allocatedQuantity: 0,
        deliveredQuantity: 0,
        ...(assignedOrganization
          ? { assignedAt: history.at(-1)?.timestamp ?? submittedAt }
          : {}),
        submittedAt,
        updatedAt: history.at(-1)?.timestamp ?? submittedAt,
        requestHistory: history,
      });
    }
  );

  const shelters = Array.from(
    { length: DEMO_DATA_COUNTS.shelters },
    (_, index) => {
      const totalCapacity = faker.number.int({ min: 80, max: 1200 });
      const currentOccupancy = faker.number.int({ min: 0, max: totalCapacity });
      const status = currentOccupancy === totalCapacity
        ? "full"
        : faker.helpers.arrayElement(["active", "inactive", "under_maintenance"] as const);
      const createdAt = new Date(context.generatedAt.getTime() - (index + 2) * 86_400_000);
      return withDemoOrigin<ShelterDocument>({
        _id: new ObjectId(),
        name: `${faker.location.street()} Community Shelter`,
        location: pickLocation(),
        coordinates: pickCoordinates(),
        totalCapacity,
        currentOccupancy,
        availableCapacity: totalCapacity - currentOccupancy,
        facilities: faker.helpers.arrayElements(facilities, { min: 2, max: 5 }),
        shelterManagerId: context.shelterManager.id,
        status,
        occupancyHistory: currentOccupancy === 0 ? [] : [{
          occupancyChange: currentOccupancy,
          currentOccupancy,
          availableCapacity: totalCapacity - currentOccupancy,
          timestamp: createdAt,
          changedBy: context.shelterManager.id,
          reason: "Generated demo occupancy baseline",
        }],
        activityHistory: [{
          action: "shelter_registered",
          timestamp: createdAt,
          changedBy: context.shelterManager.id,
          details: "Generated demo shelter",
        }],
        createdBy: context.shelterManager.id,
        createdAt,
        updatedAt: createdAt,
      });
    }
  );

  const volunteers = context.volunteerUsers.map((user) => {
    const createdAt = faker.date.recent({ days: 120, refDate: context.generatedAt });
    return withDemoOrigin<VolunteerDocument>({
      _id: new ObjectId(),
      userId: user.id,
      fullName: user.name,
      email: user.email,
      phone: faker.phone.number(),
      skills: faker.helpers.arrayElements(volunteerSkills, { min: 1, max: 4 }),
      availability: faker.helpers.arrayElement(["available", "unavailable"] as const),
      history: [{
        action: "registered",
        timestamp: createdAt,
        changedBy: user.id,
        details: "Generated demo volunteer profile",
      }],
      createdAt,
      updatedAt: createdAt,
    });
  });

  const resources = Array.from(
    { length: DEMO_DATA_COUNTS.resources },
    (_, index) => {
      const organization = organizations[index % organizations.length];
      const category = resourceCategories[index % resourceCategories.length];
      const availableQuantity = faker.number.int({ min: 25, max: 5000 });
      const createdAt = faker.date.recent({ days: 180, refDate: context.generatedAt });
      return withDemoOrigin<ResourceDocument>({
        _id: new ObjectId(),
        name: `${faker.commerce.productName()} ${category.replaceAll("_", " ")}`,
        category,
        availableQuantity,
        allocatedQuantity: 0,
        distributedQuantity: 0,
        storageLocation: `${faker.location.streetAddress()}, ${organization.region}`,
        organizationId: organization._id,
        availability: calculateResourceAvailability(availableQuantity, 0, 0),
        stockHistory: [{
          action: "resource_registered",
          quantityChange: availableQuantity,
          availableQuantity,
          allocatedQuantity: 0,
          timestamp: createdAt,
          changedBy: context.organizationUsers[index % context.organizationUsers.length].id,
          reason: "Generated demo stock baseline",
        }],
        createdBy: context.organizationUsers[index % context.organizationUsers.length].id,
        createdAt,
        updatedAt: createdAt,
      });
    }
  );

  return { organizations, incidents, emergencyRequests, shelters, volunteers, resources };
};
