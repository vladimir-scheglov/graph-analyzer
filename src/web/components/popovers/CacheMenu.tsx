import React, { useState } from "react";
import { MIcon } from "../common/MIcon";

export interface CacheMenuProps {
    remoteInfo: any;
    close: () => void;
}

export function CacheMenu({ remoteInfo, close }: CacheMenuProps) {
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const isRemote = remoteInfo?.mode !== "hybrid" && !!remoteInfo?.server;

    const onRefresh = async () => {
        setRefreshing(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/refresh-cache", { method: "POST" });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.error || data.ok === false) {
                setError(data.error || `HTTP ${res.status}`);
                setRefreshing(false);
                return;
            }

            setSuccess(
                `Обновлено: ${data.domainCount} доменов, ` +
                `${data.entityCount} сущностей. Перезагрузка...`,
            );

            // Даём пользователю увидеть успех и перезагружаем.
            // После reload сервер отрендерит HTML с актуальным remoteInfo,
            // а dataGraph в новой вкладке соберётся заново.
            setTimeout(() => {
                // no-store для / на сервере, но подстрахуемся — сбрасываем
                // браузерный кэш через query-параметр.
                const url = new URL(window.location.href);
                //url.searchParams.set("_t", String(Date.now()));
                window.location.replace(url.toString());
            }, 900);
        } catch (err: any) {
            setError(err.message || "Сетевая ошибка");
            setRefreshing(false);
        }
    };

    const fetchedAt = remoteInfo?.fetchedAt;

    return (
        <div className="menu" style={{ padding: 12 }}>
            <div className="cache-menu__header">
                <MIcon name="database" size="sm" />
                <span>Кеш доменов</span>
            </div>

            <div className="cache-menu__rows">
                <div className="cache-menu__row">
                    <span className="cache-menu__label">Режим</span>
                    <span className="cache-menu__value">
                        {remoteInfo?.mode === "hybrid" ? "hybrid" : "remote"}
                    </span>
                </div>
                <div className="cache-menu__row">
                    <span className="cache-menu__label">Сервер</span>
                    <code className="cache-menu__value" title={remoteInfo?.server}>
                        {remoteInfo?.server || "—"}
                    </code>
                </div>
                <div className="cache-menu__row">
                    <span className="cache-menu__label">Каталог</span>
                    <code className="cache-menu__value" title={remoteInfo?.cacheDir}>
                        {remoteInfo?.cacheDir || "—"}
                    </code>
                </div>
                {fetchedAt && (
                    <div className="cache-menu__row">
                        <span className="cache-menu__label">Обновлён</span>
                        <span className="cache-menu__value">
                            {new Date(fetchedAt).toLocaleString("ru-RU")}
                        </span>
                    </div>
                )}
            </div>

            {error && (
                <div className="cache-menu__error">
                    <MIcon name="error" size="sm" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="cache-menu__success">
                    <MIcon name="check_circle" size="sm" />
                    <span>{success}</span>
                </div>
            )}

            {isRemote && (
                <button
                    className="btn btn--primary cache-menu__refresh"
                    onClick={onRefresh}
                    disabled={refreshing}
                >
                    <MIcon
                        name={refreshing ? "hourglass_top" : "refresh"}
                        size="sm"
                    />
                    <span>{refreshing ? "Обновление..." : "Обновить кеш"}</span>
                </button>
            )}

            {!isRemote && (
                <div className="cache-menu__hint">
                    Гибридный режим: файлы читаются из локального каталога,
                    кеш не используется. Обновить — перезапустить CLI с{" "}
                    <code>--refresh</code>.
                </div>
            )}
        </div>
    );
}