import { createRoot } from 'react-dom/client';
import App from './App';

// ============ Material Symbols: скрыть до готовности шрифта ============

function markFontsReady(): void {
    document.documentElement.classList.add('fonts-ready');
}

async function waitForIcons(): Promise<void> {
    try {
        // Точное ожидание нужного шрифта
        if (document.fonts && typeof document.fonts.load === 'function') {
            await document.fonts.load('24px "Material Symbols Outlined"');
            markFontsReady();
            return;
        }
    } catch {
        // Ниже — fallback
    }

    // Fallback для браузеров без document.fonts
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(markFontsReady);
    } else {
        // Совсем старые — показываем через 1 сек
        setTimeout(markFontsReady, 1000);
    }
}

// Финальная защита: если шрифт так и не загрузился (оффлайн, блокировка CDN) —
// показываем иконки через 3.5 секунды, чтобы UI не остался без иконок.
const fallbackTimer = setTimeout(markFontsReady, 3500);

waitForIcons().then(() => {
    clearTimeout(fallbackTimer);
});

// ============ Монтирование ============

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(<App />);