import { useEffect, useRef, type FC } from 'react';
import { useMonacoLoader } from '../../../hooks/useMonacoLoader';
import { RQL_LANGUAGE_ID, rqlMonarch, buildRqlTheme, RQL_THEME_DARK, RQL_THEME_LIGHT } from './monarch';
import { registerRqlCompletion } from './completion';
import { registerRqlDiagnostics } from './diagnostics';
import type { RqlContext } from './context';

interface Props {
    value: string;
    onChange: (rql: string) => void;
    /** Контекст для completion / diagnostics. */
    context: RqlContext;
    /** Высота редактора, px. По умолчанию 200. */
    height?: number;
    /** Только для чтения. */
    readOnly?: boolean;
    placeholder?: string;
}

let languageRegistered = false;
let themesRegistered = false;
let completionRegistered = false;
let diagnosticsRegistered = false;
const disposers: Array<{ dispose: () => void }> = [];
let contextRef: { current: RqlContext | null } = { current: null };

export const RqlEditor: FC<Props> = ({
    value, onChange, context, height = 200, readOnly = false, placeholder,
}) => {
    const { ready, error } = useMonacoLoader();
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);

    // Обновляем контекст каждый рендер (нужен для completion)
    useEffect(() => {
        contextRef.current = context;
    }, [context]);

    // Регистрируем язык / тему / провайдеры один раз
    useEffect(() => {
        if (!ready) return;
        const monaco = (window as any).monaco;
        if (!monaco) return;

        if (!languageRegistered) {
            monaco.languages.register({ id: RQL_LANGUAGE_ID });
            monaco.languages.setMonarchTokensProvider(RQL_LANGUAGE_ID, rqlMonarch);
            languageRegistered = true;
        }

        if (!themesRegistered) {
            monaco.editor.defineTheme(RQL_THEME_DARK, buildRqlTheme(true));
            monaco.editor.defineTheme(RQL_THEME_LIGHT, buildRqlTheme(false));
            themesRegistered = true;
        }

        if (!completionRegistered) {
            disposers.push(
                registerRqlCompletion(monaco, () => contextRef.current),
            );
            completionRegistered = true;
        }

        if (!diagnosticsRegistered) {
            disposers.push(
                registerRqlDiagnostics(monaco, () => contextRef.current),
            );
            diagnosticsRegistered = true;
        }
    }, [ready]);

    // Создаём редактор
    useEffect(() => {
        if (!ready || !containerRef.current) return;
        const monaco = (window as any).monaco;
        if (!monaco) return;

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

        const editor = monaco.editor.create(containerRef.current, {
            value,
            language: RQL_LANGUAGE_ID,
            theme: isDark ? RQL_THEME_DARK : RQL_THEME_LIGHT,
            readOnly,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 3,
            automaticLayout: true,
            placeholder,
        });

        editorRef.current = editor;

        const sub = editor.onDidChangeModelContent(() => {
            const v = editor.getValue();
            onChange(v);
        });

        return () => {
            sub.dispose();
            editor.dispose();
            editorRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);

    // Внешнее обновление value
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (editor.getValue() !== value) {
            editor.setValue(value);
        }
    }, [value]);

    // Переключение темы
    useEffect(() => {
        if (!ready) return;
        const monaco = (window as any).monaco;
        if (!monaco || !editorRef.current) return;

        const observer = new MutationObserver(() => {
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            monaco.editor.setTheme(isDark ? RQL_THEME_DARK : RQL_THEME_LIGHT);
        });
        observer.observe(document.documentElement, {
            attributes: true, attributeFilter: ['data-theme'],
        });
        return () => observer.disconnect();
    }, [ready]);

    if (error) {
        return (
            <div className="rql-editor rql-editor--error">
                Ошибка загрузки Monaco: {error}
            </div>
        );
    }

    if (!ready) {
        return <div className="rql-editor rql-editor--loading">Загрузка редактора…</div>;
    }

    return (
        <div
            className="rql-editor"
            ref={containerRef}
            style={{ height: `${height}px` }}
        />
    );
};