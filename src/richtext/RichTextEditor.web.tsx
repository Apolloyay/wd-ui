import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Web rich text editor -- a plain contentEditable div driven by
 * document.execCommand. Deprecated API, but still broadly supported for
 * exactly this set of basic commands, and needs zero extra dependencies.
 * See RichTextEditor.tsx for the native (iOS) implementation; both read/write
 * the same small HTML fragment (see bodyFormat in types/entry.ts).
 *
 * Deliberately uncontrolled: innerHTML is only pushed in from `initialHtml`
 * when it actually changes (i.e. a different entry loaded), never on every
 * keystroke -- re-setting innerHTML from React state on every onInput would
 * reset the caret position mid-typing.
 *
 * Word-style "select text, then click Bold" only works if the browser's
 * selection is still intact at the moment execCommand runs. Clicking a plain
 * button moves focus off the contentEditable, which collapses that
 * selection before a normal onClick handler would ever see it -- so every
 * control here (a) never lets the click actually take focus
 * (onMouseDown -> preventDefault, for the format buttons) and (b)
 * continuously remembers the last real selection inside the editor via the
 * document-level `selectionchange` event, re-applying it right before
 * running a command (needed for the font picker, which as a real <select>
 * *does* need to take focus to be usable).
 */
interface Props {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
}

const TOOLBAR_ITEMS: { key: string; label: string; command: string; value?: string; queryState?: string }[] = [
  { key: 'bold', label: 'B', command: 'bold', queryState: 'bold' },
  { key: 'italic', label: 'I', command: 'italic', queryState: 'italic' },
  { key: 'underline', label: 'U', command: 'underline', queryState: 'underline' },
  { key: 'h2', label: 'H2', command: 'formatBlock', value: 'H2' },
  { key: 'ul', label: '•', command: 'insertUnorderedList', queryState: 'insertUnorderedList' },
  { key: 'ol', label: '1.', command: 'insertOrderedList', queryState: 'insertOrderedList' },
];

const FONT_CHOICES: { label: string; value: string }[] = [
  { label: 'Default', value: '-apple-system, Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  // Chinese font styles -- PingFang SC/Songti SC/etc. are Apple's system
  // names (macOS/iOS), Microsoft YaHei/SimSun/KaiTi/FangSong are Windows',
  // and Noto Sans/Serif SC is the common fallback where neither is installed
  // (most Linux/Android/Chrome OS browsers).
  { label: '黑体', value: '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  { label: '宋体', value: '"Songti SC", STSong, SimSun, "Noto Serif SC", serif' },
  { label: '楷体', value: '"Kaiti SC", STKaiti, KaiTi, "Noto Serif SC", serif' },
  { label: '仿宋', value: 'STFangsong, FangSong, "Noto Serif SC", serif' },
];

export default function RichTextEditor({ initialHtml, onChangeHtml, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef<string | null>(null);
  const lastRangeRef = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(!initialHtml);
  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (editorRef.current && loadedRef.current !== initialHtml) {
      editorRef.current.innerHTML = initialHtml;
      loadedRef.current = initialHtml;
      setIsEmpty((editorRef.current.textContent ?? '').trim() === '');
    }
  }, [initialHtml]);

  // Tracks the editor's own selection independent of whatever the toolbar is
  // doing, so a control that must take focus (the font <select>) can still
  // apply its change to the text the user actually selected.
  useEffect(() => {
    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      lastRangeRef.current = range.cloneRange();
      setActiveStates({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    loadedRef.current = html;
    setIsEmpty((el.textContent ?? '').trim() === '');
    onChangeHtml(html);
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    const range = lastRangeRef.current;
    if (!editor) return;
    editor.focus();
    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const exec = (command: string, value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value);
    handleInput();
  };

  return (
    <View>
      <View style={styles.toolbar}>
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            // Stops the button from taking focus at all, so the browser's
            // text selection in the editor is never disturbed in the first
            // place -- this is what makes "select, then click Bold" work.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(item.command, item.value)}
            style={{
              ...toolbarButtonStyle,
              ...(item.queryState && activeStates[item.queryState] ? toolbarButtonActiveStyle : null),
            }}
          >
            {item.label}
          </button>
        ))}
        <select
          defaultValue=""
          onChange={(e) => {
            const font = e.target.value;
            if (font) exec('fontName', font);
            e.target.value = ''; // an action, not a live indicator of the selection's current font
          }}
          style={fontSelectStyle}
        >
          <option value="" disabled>
            Font…
          </option>
          {FONT_CHOICES.map((font) => (
            <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
      </View>
      <View style={styles.editorWrap}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          style={editorDomStyle}
        />
        {isEmpty && placeholder && (
          <Text style={styles.placeholder} pointerEvents="none">
            {placeholder}
          </Text>
        )}
      </View>
    </View>
  );
}

const editorDomStyle: CSSProperties = {
  minHeight: 250,
  fontSize: 16,
  lineHeight: '22px',
  outline: 'none',
  fontFamily: 'inherit',
};

const toolbarButtonStyle: CSSProperties = {
  paddingLeft: 10,
  paddingRight: 10,
  paddingTop: 6,
  paddingBottom: 6,
  borderRadius: 10,
  border: 'none',
  backgroundColor: colors.chip,
  minWidth: 32,
  fontSize: 13,
  fontWeight: 700,
  color: colors.primary,
  cursor: 'pointer',
};

const toolbarButtonActiveStyle: CSSProperties = {
  backgroundColor: colors.primary,
  color: colors.white,
};

const fontSelectStyle: CSSProperties = {
  paddingLeft: 8,
  paddingRight: 8,
  paddingTop: 6,
  paddingBottom: 6,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.white,
  fontSize: 13,
  color: colors.textDim,
  cursor: 'pointer',
};

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  editorWrap: { position: 'relative' },
  placeholder: { position: 'absolute', top: 0, left: 0, fontSize: 16, color: colors.placeholder },
});
