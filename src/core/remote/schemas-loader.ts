import { httpPost, HttpError } from "./http-client";
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
  expertise(id: $id) {
    id
    sourceId
    sourceCode
    draft
    status
    version
    updatedAt
    updater { id displayName }
  }
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
  if (res.status !== 200) throw new HttpError(res.status);
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

  if (res.status !== 200) throw new HttpError(res.status);
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

/** Метаданные экспертизы, которые нужны UI. */
export interface ExpertiseMeta {
  /** Версия опубликованной схемы (не draft). Пустая строка, если не задана. */
  publishedVersion: string;
  /** ISO-время последнего изменения (публикация или сохранение черновика). */
  updatedAt: string | null;
  /** displayName последнего изменившего. */
  updatedBy: string | null;
}

interface ExpertiseRaw {
  sourceCode: string;
  draft: string | null;
  meta: ExpertiseMeta;
}

async function fetchExpertiseRaw(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<ExpertiseRaw> {
  const res = await httpPost(
    apiUrl,
    { operationName: "expertise", variables: { id }, query: EXPERTISE_QUERY },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  const e = res.json?.data?.expertise;
  if (!e) throw new Error("Некорректный ответ");
  return {
    sourceCode: typeof e.sourceCode === "string" ? e.sourceCode : "",
    draft: typeof e.draft === "string" && e.draft.length > 0 ? e.draft : null,
    meta: {
      publishedVersion: typeof e.version === "string" ? e.version : "",
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : null,
      updatedBy: e.updater?.displayName ?? null,
    },
  };
}

export interface ExpertiseSourceResult {
  /** Итоговый YAML: draft (если непустой) иначе sourceCode. */
  source: string;
  /** true — вернули draft, false — опубликованный sourceCode. */
  fromDraft: boolean;
  meta: ExpertiseMeta;
}

/** Возвращает draft (если есть) или опубликованный sourceCode + метаданные. */
export async function apiFetchExpertiseSource(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<ExpertiseSourceResult> {
  const raw = await fetchExpertiseRaw(apiUrl, token, tenantId, id, rejectUnauthorized);
  return {
    source: raw.draft ?? raw.sourceCode,
    fromDraft: raw.draft !== null,
    meta: raw.meta,
  };
}

export interface ExpertisePublishedResult {
  source: string;
  meta: ExpertiseMeta;
}

/** Возвращает только опубликованную версию, никогда не draft. */
export async function apiFetchExpertisePublished(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<ExpertisePublishedResult> {
  const raw = await fetchExpertiseRaw(apiUrl, token, tenantId, id, rejectUnauthorized);
  return { source: raw.sourceCode, meta: raw.meta };
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

/**
 * Разбирает GraphQL-ошибку из ответа и бросает Error с полями:
 *   - code     — extensions.code (например, EXPERTISE.PUBLISH.LOWER_VERSION)
 *   - message  — человекочитаемое сообщение (Zod-details, если есть,
 *                разворачиваются в "path: message; path2: message2")
 */
function throwGraphQLError(json: any): never {
  const err = json?.errors?.[0];
  if (!err) throw new Error("Некорректный ответ сервера");

  const code = String(err?.extensions?.code || "");
  const zodDetails = err?.extensions?.details?.details;

  let message: string;
  if (Array.isArray(zodDetails) && zodDetails.length > 0) {
    message = zodDetails
      .map((d: any) => {
        const path = Array.isArray(d?.path) ? d.path.join(".") : "";
        const msg = String(d?.message || d?.validation || "ошибка");
        return path ? `${path}: ${msg}` : msg;
      })
      .join("; ");
  } else {
    message = String(err.message || "Ошибка сервера");
  }

  const e: any = new Error(message);
  e.code = code;
  throw e;
}

const PUBLISH_MUTATION = `mutation publishExpertise($input: PublishExpertiseInput!) {
  publishExpertise(input: $input) {
    id
    name
    __typename
  }
}`;

export interface PublishExpertiseInput {
  id: string;
  folderId: string;
  organizationId: string;
  sourceCode: string;
  type: "DOMAIN";
}

/**
 * Публикует экспертизу. Бросает Error с полями `code` (extensions.code)
 * и `message` (с развёрнутыми Zod-деталями, если есть).
 */
export async function apiPublishExpertise(
  apiUrl: string,
  token: string,
  tenantId: string,
  input: PublishExpertiseInput,
  rejectUnauthorized: boolean,
): Promise<{ id: string; name: string }> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "publishExpertise",
      variables: { input },
      query: PUBLISH_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );

  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.publishExpertise;
  if (!data) throw new Error("Некорректный ответ publishExpertise");
  return { id: data.id, name: data.name };
}

const SAVE_DRAFT_MUTATION = `mutation saveExpertiseDraft($input: SaveExpertiseDraftInput!) {
  saveExpertiseDraft(input: $input) {
    id
    name
    __typename
  }
}`;

export interface SaveExpertiseDraftInput {
  id: string;
  folderId: string;
  organizationId: string;
  sourceCode: string;
  type: "DOMAIN";
}

/**
 * Сохраняет черновик экспертизы (без публикации, version не проверяется).
 * Бросает Error с полями `code` / `message`.
 */
export async function apiSaveExpertiseDraft(
  apiUrl: string,
  token: string,
  tenantId: string,
  input: SaveExpertiseDraftInput,
  rejectUnauthorized: boolean,
): Promise<{ id: string; name: string }> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "saveExpertiseDraft",
      variables: { input },
      query: SAVE_DRAFT_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );

  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.saveExpertiseDraft;
  if (!data) throw new Error("Некорректный ответ saveExpertiseDraft");
  return { id: data.id, name: data.name };
}