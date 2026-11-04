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

const EXPERTISES_PAGE_LIMIT = 500;

export async function apiFetchExpertises(
  apiUrl: string,
  token: string,
  tenantId: string,
  rootFolderId: string,
  rejectUnauthorized: boolean,
  onProgress?: (fetched: number, total: number) => void,
): Promise<RemoteDomain[]> {
  const all: any[] = [];
  let offset = 0;
  let total: number | null = null;

  for (;;) {
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
          pagination: { limit: EXPERTISES_PAGE_LIMIT, offset },
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

    const page = Array.isArray(data.expertises) ? data.expertises : [];
    all.push(...page);

    if (total == null) {
      total =
        typeof data.pageInfo?.totalCount === "number"
          ? data.pageInfo.totalCount
          : null;
    }
    onProgress?.(all.length, total ?? all.length);

    // Пагинация: если totalCount известен — стоп по нему.
    // Если неизвестен — стоп по короткой странице.
    if (page.length === 0) break;
    if (total != null && all.length >= total) break;
    if (page.length < EXPERTISES_PAGE_LIMIT) break;

    offset += EXPERTISES_PAGE_LIMIT;
  }

  return all.map(
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
  const raw = await fetchExpertiseRaw(
    apiUrl,
    token,
    tenantId,
    id,
    rejectUnauthorized,
  );
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
  const raw = await fetchExpertiseRaw(
    apiUrl,
    token,
    tenantId,
    id,
    rejectUnauthorized,
  );
  return { source: raw.sourceCode, meta: raw.meta };
}

// ============ История версий экспертизы ============

const EXPERTISE_VERSIONS_QUERY = `query expertiseVersions($filter: ExpertiseVersionsFilter!, $pagination: PaginationInput, $organizationIds: [String!]!) {
  expertiseVersions(filter: $filter, pagination: $pagination, organizationIds: $organizationIds) {
    versions {
      expertiseId
      id
      version
      sourceCode
      updatedAt
      updater { id displayName __typename }
      __typename
    }
    pageInfo {
      pagination { limit offset __typename }
      totalCount
      __typename
    }
    __typename
  }
}`;

export interface ExpertiseVersionMeta {
  /** id версии (UUID). */
  id: string;
  /** id экспертизы (тот же для всех версий). */
  expertiseId: string;
  /** SemVer-версия (например, "1.1.0-0"). */
  version: string;
  /**
   * Полный YAML. Может быть пустым — если сервер не отдаёт sourceCode
   * в list-запросе или у пользователя нет прав на исторические версии.
   */
  sourceCode: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ExpertiseVersionsResult {
  versions: ExpertiseVersionMeta[];
  totalCount: number;
}

export async function apiFetchExpertiseVersions(
  apiUrl: string,
  token: string,
  tenantId: string,
  expertiseId: string,
  rejectUnauthorized: boolean,
  pagination: { limit: number; offset: number } = { limit: 50, offset: 0 },
): Promise<ExpertiseVersionsResult> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "expertiseVersions",
      variables: {
        filter: { expertiseId },
        organizationIds: [],
        pagination,
      },
      query: EXPERTISE_VERSIONS_QUERY,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.expertiseVersions;
  if (!data) throw new Error("Некорректный ответ expertiseVersions");

  const versions: ExpertiseVersionMeta[] = (
    Array.isArray(data.versions) ? data.versions : []
  )
    .map((v: any) => ({
      id: String(v.id || ""),
      expertiseId: String(v.expertiseId || ""),
      version: String(v.version || ""),
      sourceCode: typeof v.sourceCode === "string" ? v.sourceCode : "",
      updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
      updatedBy: v.updater?.displayName || null,
    }))
    .filter((v) => !!v.id);

  return {
    versions,
    totalCount:
      typeof data.pageInfo?.totalCount === "number"
        ? data.pageInfo.totalCount
        : versions.length,
  };
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

const SAVE_DOMAIN_SCHEMA_MUTATION = `mutation saveDomainSchemaObject($input: SaveDomainSchemaObjectInput!) {
  saveDomainSchemaObject(input: $input) {
    id
    name
    __typename
  }
}`;

export interface SaveDomainSchemaObjectInput {
  draftSchema: {
    data: Record<string, any>;
    metadata: {
      id: string;
      name: string;
      version?: string;
      author?: string;
      description?: string;
      tags?: string[];
    };
  };
  folderId: string;
}

export async function apiSaveDomainSchemaObject(
  cmsBffUrl: string,
  token: string,
  tenantId: string,
  input: SaveDomainSchemaObjectInput,
  rejectUnauthorized: boolean,
): Promise<{ id: string; name: string }> {
  const res = await httpPost(
    cmsBffUrl,
    {
      operationName: "saveDomainSchemaObject",
      variables: { input },
      query: SAVE_DOMAIN_SCHEMA_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.saveDomainSchemaObject;
  if (!data) throw new Error("Некорректный ответ saveDomainSchemaObject");
  return { id: data.id, name: data.name };
}

const DELETE_EXPERTISE_MUTATION = `mutation deleteExpertise($input: RequiredIdInput!) {
  deleteExpertise(input: $input) {
    id
    __typename
  }
}`;

export async function apiDeleteExpertise(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<{ id: string }> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "deleteExpertise",
      variables: { input: { id } },
      query: DELETE_EXPERTISE_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.deleteExpertise;
  if (!data) throw new Error("Некорректный ответ deleteExpertise");
  return { id: data.id };
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
  organizationId?: string;
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
const ENABLE_EXPERTISE_MUTATION = `mutation enableExpertise($input: RequiredIdInput!) {
  enableExpertise(input: $input) {
    id
    __typename
  }
}`;

const DISABLE_EXPERTISE_MUTATION = `mutation disableExpertise($input: RequiredIdInput!) {
  disableExpertise(input: $input) {
    id
    __typename
  }
}`;

export async function apiEnableExpertise(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<{ id: string }> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "enableExpertise",
      variables: { input: { id } },
      query: ENABLE_EXPERTISE_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.enableExpertise;
  if (!data) throw new Error("Некорректный ответ enableExpertise");
  return { id: data.id };
}

export async function apiDisableExpertise(
  apiUrl: string,
  token: string,
  tenantId: string,
  id: string,
  rejectUnauthorized: boolean,
): Promise<{ id: string }> {
  const res = await httpPost(
    apiUrl,
    {
      operationName: "disableExpertise",
      variables: { input: { id } },
      query: DISABLE_EXPERTISE_MUTATION,
    },
    { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
    rejectUnauthorized,
  );
  if (res.status !== 200) throw new HttpError(res.status);
  if (Array.isArray(res.json?.errors) && res.json.errors.length > 0) {
    throwGraphQLError(res.json);
  }
  const data = res.json?.data?.disableExpertise;
  if (!data) throw new Error("Некорректный ответ disableExpertise");
  return { id: data.id };
}