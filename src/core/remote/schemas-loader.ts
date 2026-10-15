import { httpPost } from "./http-client";
import type { RemoteFolder, RemoteDomain } from "../../shared/types";

const FOLDERS_QUERY = `query resourceFolders {
  resourceFolders { id name parentFolderId }
}`;

const EXPERTISES_QUERY = `query expertises($filter: ExpertisesFilter, $pagination: PaginationInput, $sorting: ExpertisesSorting, $organizationIds: [String!]!) {
  expertises(filter: $filter, pagination: $pagination, sorting: $sorting, organizationIds: $organizationIds) {
    expertises {
      id sourceId folderId type name objectType dataSource description draft author status tags version severity createdAt updatedAt
      updater { id displayName }
      organization { id name }
    }
    pageInfo { pagination { limit offset } totalCount }
  }
}`;

const EXPERTISE_QUERY = `query expertise($id: String!) {
  expertise(id: $id) { id sourceId sourceCode status }
}`;

const CHECK_ROBJECT_MUTATION = `mutation checkRobject($input: CheckRobjectInput!) {
  checkRobject(input: $input) {
    isValid
    diagnostics {
      message severity
      labels { message primary span { end start } }
    }
  }
}`;

export async function apiFetchFolders(
  apiUrl: string,
  token: string,
  tenantId: string,
  rejectUnauthorized: boolean,
): Promise<RemoteFolder[]> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "resourceFolders",
      variables: {},
      query: FOLDERS_QUERY,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new Error("HTTP " + res.status);
  const folders = res.json?.data?.resourceFolders;
  if (!Array.isArray(folders)) throw new Error("Некорректный ответ");
  return folders;
}

export async function apiFetchExpertises(
  apiUrl: string,
  token: string,
  tenantId: string,
  rootFolderId: string,
  rejectUnauthorized: boolean,
): Promise<RemoteDomain[]> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "expertises",
      variables: {
        filter: {
          folder: { folderId: rootFolderId, withChildFolders: true },
          query: "",
          types: ["DOMAIN"],
        },
        organizationIds: [],
        pagination: { limit: 500, offset: 0 },
        sorting: { order: "DESC", orderBy: "UPDATED_AT" },
      },
      query: EXPERTISES_QUERY,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );

  if (res.status !== 200) throw new Error("HTTP " + res.status);
  const data = res.json?.data?.expertises;
  if (!data) throw new Error("Некорректный ответ");

  return (data.expertises || []).map(
    (d: any): RemoteDomain => ({
      id: d.id,
      sourceId: d.sourceId,
      folderId: d.folderId,
      type: d.type,
      name: d.name || "",
      status: d.status,
      version: d.version || "",
      description: d.description || "",
      author: d.author || "",
      tags: Array.isArray(d.tags) ? d.tags : [],
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
      objectType: d.objectType || null,
      updater: d.updater
        ? { id: d.updater.id, displayName: d.updater.displayName }
        : null,
      organization: d.organization
        ? { id: d.organization.id, name: d.organization.name }
        : null,
    }),
  );
}

export async function apiFetchExpertiseSource(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<string> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "expertise",
      variables: { id },
      query: EXPERTISE_QUERY,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new Error("HTTP " + res.status);
  const e = res.json?.data?.expertise;
  if (!e) throw new Error("Некорректный ответ");
  return e.sourceCode;
}

export async function apiCheckRobject(
  apiUrl: string,
  token: string,
  tenantId: string,
  sourceCode: string,
  rejectUnauthorized: boolean,
) {
  return httpPost(
    apiUrl,
    {
      operationName: "checkRobject",
      variables: { input: { type: "DOMAIN", sourceCode } },
      query: CHECK_ROBJECT_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
}
