import React, { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { readRemoteInfo } from "../../state/initial";
import { MIcon } from "../common/MIcon";
import { Combobox } from "../common/Combobox";
import { openFileInEditor } from "../../lib/open-file";
import { FolderTreeSelect } from "../common/FolderTreeSelect";
import { DOMAIN_TEMPLATES, CATEGORY_LABELS, DomainTemplate } from "../../lib/domains/templates";

interface RemoteFolder {
    id: string;
    name: string;
    parentFolderId: string | null;
}

export function CreateDomainModal() {
    const open = useGraphStore((s) => s.createDomainOpen);
    const setOpen = useGraphStore((s) => s.setCreateDomainOpen);
    const { index } = useModelIndex();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const isRemote = !!remoteInfo?.server && remoteInfo.mode !== "hybrid";
    const [yamlPreviewOpen, setYamlPreviewOpen] = useState(false);

    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [author, setAuthor] = useState("");
    const [tagsRaw, setTagsRaw] = useState("");
    const [description, setDescription] = useState("");
    const [folderId, setFolderId] = useState("");
    const [folderPath, setFolderPath] = useState("");
    const [templateId, setTemplateId] = useState("empty");
    const [folders, setFolders] = useState<RemoteFolder[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{
        filePath: string;
        expertiseId: string | null;
    } | null>(null);

    useEffect(() => {
        if (!open) return;
        setId("");
        setName("");
        setAuthor("");
        setTagsRaw("");
        setDescription("");
        setFolderPath("");
        setTemplateId("empty");
        setError(null);
        setSuccess(null);
        setSubmitting(false);
        setYamlPreviewOpen(false);
        setTimeout(() => {
            document
                .querySelector<HTMLInputElement>('input[placeholder="my.new.domain.tld"]')
                ?.focus();
        }, 60);
        if (isRemote) {
            fetch("/api/folders")
                .then((r) => r.json())
                .then((d) => {
                    setFolders(d.folders || []);
                    if ((d.folders || []).length > 0) {
                        const root = (d.folders as RemoteFolder[]).find(
                            (f) => !f.parentFolderId,
                        );
                        setFolderId(root?.id || (d.folders[0] as RemoteFolder).id);
                    }
                })
                .catch(() => setFolders([]));
        }
    }, [open, isRemote]);

    const idValid =
        !id || /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i.test(id);
    const idExists =
        !!index &&
        !!id &&
        index.domains.some((d) => d.id.toLowerCase() === id.toLowerCase());
    const canSubmit =
        !!id &&
        idValid &&
        !idExists &&
        !!name &&
        !submitting &&
        (!isRemote || !!folderId);

    const selectedTemplate = useMemo(
        () => DOMAIN_TEMPLATES.find((t) => t.id === templateId) || DOMAIN_TEMPLATES[0],
        [templateId],
    );

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const tags = tagsRaw
                .split(/[,;\n]+/)
                .map((t) => t.trim())
                .filter(Boolean);
            const tpl = DOMAIN_TEMPLATES.find((t) => t.id === templateId);
            const res = await fetch("/api/create-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: id.trim(),
                    name: name.trim(),
                    author: author.trim() || undefined,
                    description: description.trim() || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    version: "0.0.1",
                    folderId: isRemote ? folderId : undefined,
                    folderPath: !isRemote ? folderPath.trim() || undefined : undefined,
                    templateYaml: tpl?.body || "",
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || `HTTP ${res.status}`);
                return;
            }

            setSuccess({
                filePath: data.filePath,
                expertiseId: data.expertiseId || null,
            });

            const st = useGraphStore.getState();

            // Свежий ModelIndex в модалках, которые уже открыты
            st.bumpModelVersion();

            try {
                await st.refreshGraphFromServer();
            } catch (e: any) {
                st.showSnackbar(
                    "Домен создан, но граф не обновился. Обновите страницу (F5).",
                );
                console.error("[create-domain] refreshGraphFromServer:", e);
            }

            // Запоминаем, что после reload нужно открыть редактор
            if (data.filePath) {
                openFileInEditor(data.filePath, null, id.trim());
            }

            // Reload — гарантирует, что граф, кэш и HTML-снапшот актуальны
            setOpen(false);
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal create-domain-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="add_circle" size="sm" />
                        <span className="icon-label">Новый домен</span>
                        <span className="help-modal__badge">
                            {isRemote ? "remote" : remoteInfo?.mode || "local"}
                        </span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => setOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                {success ? (
                    <div className="create-domain-success">
                        <MIcon
                            name="check_circle"
                            size="xl"
                            style={{ color: "var(--success)", marginBottom: 12 }}
                        />
                        <div className="create-domain-success__title">Домен создан</div>
                        <div className="create-domain-success__path">
                            {success.filePath}
                        </div>
                        {success.expertiseId && (
                            <div className="create-domain-success__meta">
                                Expertise ID: <code>{success.expertiseId}</code>
                            </div>
                        )}
                        <div className="create-domain-success__hint">
                            <MIcon name="hourglass_top" size="sm" />
                            <span>Открываем редактор и обновляем индекс…</span>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="help-modal__body help-modal__body--flush">
                            <div className="create-domain-form">
                                <label className="create-domain-field">
                                    <span className="create-domain-label">ID (FQDN) *</span>
                                    <input
                                        className="create-domain-input"
                                        value={id}
                                        onChange={(e) => setId(e.target.value)}
                                        placeholder="my.new.domain.tld"
                                        spellCheck={false}
                                    />
                                    {!idValid && (
                                        <span className="create-domain-error">
                                            Неверный формат (my.domain.tld)
                                        </span>
                                    )}
                                    {idExists && (
                                        <span className="create-domain-error">
                                            Домен уже существует
                                        </span>
                                    )}
                                </label>

                                <label className="create-domain-field">
                                    <span className="create-domain-label">Название *</span>
                                    <input
                                        className="create-domain-input"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </label>

                                <label className="create-domain-field">
                                    <span className="create-domain-label">Автор</span>
                                    <input
                                        className="create-domain-input"
                                        value={author}
                                        onChange={(e) => setAuthor(e.target.value)}
                                    />
                                </label>

                                <label className="create-domain-field">
                                    <span className="create-domain-label">
                                        Теги (через запятую)
                                    </span>
                                    <input
                                        className="create-domain-input"
                                        value={tagsRaw}
                                        onChange={(e) => setTagsRaw(e.target.value)}
                                        placeholder="risk, assets"
                                    />
                                </label>

                                <label className="create-domain-field create-domain-field--wide">
                                    <span className="create-domain-label">Описание</span>
                                    <textarea
                                        className="create-domain-input"
                                        rows={2}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </label>

                                <label className="create-domain-field create-domain-field--wide">
                                    <span className="create-domain-label">
                                        Каталог {isRemote ? "*" : "(относительно корня)"}
                                    </span>
                                    {isRemote ? (
                                        <FolderTreeSelect
                                            value={folderId}
                                            onChange={(id) => setFolderId(id)}
                                            folders={folders}
                                            placeholder="Выберите папку"
                                            disabled={folders.length === 0}
                                        />
                                    ) : (
                                        <input
                                            className="create-domain-input"
                                            value={folderPath}
                                            onChange={(e) => setFolderPath(e.target.value)}
                                            placeholder="подкаталог"
                                        />
                                    )}
                                </label>

                                <div className="create-domain-field create-domain-field--wide">
                                    <span className="create-domain-label">
                                        Шаблон предзаполнения
                                    </span>
                                    <Combobox
                                        value={templateId}
                                        onChange={(v) => {
                                            setTemplateId(v);
                                            setYamlPreviewOpen(false);
                                        }}
                                        options={DOMAIN_TEMPLATES.map((t) => ({
                                            value: t.id,
                                            label: t.label,
                                            hint: CATEGORY_LABELS[t.category],
                                        }))}
                                        icon="article"
                                        placeholder="Выберите шаблон"
                                    />
                                    {selectedTemplate && (
                                        <div className="create-domain-template-preview">
                                            <div className="create-domain-template-preview__head">
                                                <MIcon name={selectedTemplate.icon} size="sm" />
                                                <span className="create-domain-template-preview__title">
                                                    {selectedTemplate.label}
                                                </span>
                                                <span className="create-domain-template-preview__category">
                                                    {CATEGORY_LABELS[selectedTemplate.category]}
                                                </span>
                                            </div>
                                            <div className="create-domain-template-preview__desc">
                                                {selectedTemplate.description}
                                            </div>
                                            <TemplateIncludesSummary template={selectedTemplate} />

                                            <div className="create-domain-template-preview__toolbar">
                                                <button
                                                    type="button"
                                                    className="create-domain-yaml-toggle"
                                                    onClick={() => setYamlPreviewOpen((v) => !v)}
                                                >
                                                    <MIcon
                                                        name={yamlPreviewOpen ? "expand_less" : "expand_more"}
                                                        size="sm"
                                                    />
                                                    <span>{yamlPreviewOpen ? "Скрыть YAML" : "Показать YAML"}</span>
                                                    {selectedTemplate.body && (
                                                        <span className="create-domain-yaml-toggle__lines">
                                                            {selectedTemplate.body.split("\n").length} стр.
                                                        </span>
                                                    )}
                                                </button>
                                                {yamlPreviewOpen && selectedTemplate.body && (
                                                    <button
                                                        type="button"
                                                        className="create-domain-yaml-copy"
                                                        onClick={() => {
                                                            navigator.clipboard
                                                                .writeText(selectedTemplate.body)
                                                                .then(
                                                                    () =>
                                                                        useGraphStore
                                                                            .getState()
                                                                            .showSnackbar("YAML скопирован"),
                                                                    () =>
                                                                        useGraphStore
                                                                            .getState()
                                                                            .showSnackbar(
                                                                                "Не удалось скопировать",
                                                                            ),
                                                                );
                                                        }}
                                                        title="Копировать YAML в буфер"
                                                    >
                                                        <MIcon name="content_copy" size="sm" />
                                                    </button>
                                                )}
                                            </div>

                                            {yamlPreviewOpen && (
                                                <pre className="create-domain-yaml-preview">
                                                    {selectedTemplate.body ||
                                                        "// Пустой шаблон — только заголовок с вашими полями id, name, description, author, tags."}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {error && (
                                    <div className="create-domain-error-banner create-domain-error-banner--wide">
                                        <MIcon name="error" size="sm" />
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="create-domain-footer">
                            <div className="create-domain-footer__hint">
                                {isRemote
                                    ? "Схема будет создана на сервере (черновик)."
                                    : "Файл будет записан в локальный каталог."}
                            </div>
                            <div className="create-domain-footer__actions">
                                <button className="btn" onClick={() => setOpen(false)}>
                                    Отмена
                                </button>
                                <button
                                    className="btn btn--primary"
                                    onClick={submit}
                                    disabled={!canSubmit}
                                >
                                    {submitting ? "Создание…" : "Создать"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function TemplateIncludesSummary({ template }: { template: DomainTemplate }) {
    const inc = template.includes;
    const items: Array<{ key: string; label: string; accent?: boolean }> = [];

    if (inc.entities) items.push({ key: "e", label: `${inc.entities} сущ.` });
    if (inc.linkages) items.push({ key: "l", label: `${inc.linkages} связ.` });
    if (inc.dataTypes) items.push({ key: "d", label: `${inc.dataTypes} тип.` });
    if (inc.trees) items.push({ key: "t", label: `${inc.trees} дерев.` });
    if (inc.views) items.push({ key: "v", label: `${inc.views} views` });
    if (inc.actions) items.push({ key: "a", label: `${inc.actions} действ.` });
    if (inc.hasWorkflow)
        items.push({ key: "w", label: "Workflow", accent: true });
    if (inc.hasMenu) items.push({ key: "m", label: "меню", accent: true });
    if (inc.hasMedias) items.push({ key: "md", label: "иконки" });

    if (items.length === 0) {
        return (
            <div className="create-domain-template-preview__summary create-domain-template-preview__summary--empty">
                Пустой домен
            </div>
        );
    }

    return (
        <div className="create-domain-template-preview__summary">
            {items.map((it, i) => (
                <React.Fragment key={it.key}>
                    {i > 0 && <span className="create-domain-template-preview__sep">·</span>}
                    <span
                        className={
                            "create-domain-template-preview__chip" +
                            (it.accent ? " create-domain-template-preview__chip--accent" : "")
                        }
                    >
                        {it.label}
                    </span>
                </React.Fragment>
            ))}
        </div>
    );
}