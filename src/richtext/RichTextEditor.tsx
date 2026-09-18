import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { actions, RichEditor, RichToolbar } from 'react-native-pell-rich-editor';
import { colors } from '../theme/colors';

/**
 * Native (iOS) rich text editor -- react-native-pell-rich-editor wraps a
 * WebView-based editor, since RN's own TextInput can't render inline
 * formatting. Unlike the web editor, this library already applies its
 * toolbar actions (bold/italic/...) to whatever is selected inside the
 * WebView out of the box -- that's the whole point of it -- so no
 * selection-preservation workaround is needed here, just the font picker.
 * See RichTextEditor.web.tsx for the web implementation; both read/write the
 * same small HTML fragment (see bodyFormat in types/entry.ts).
 */
interface Props {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
}

const FONT_CHOICES: { label: string; value: string }[] = [
  { label: 'Default', value: '-apple-system, Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  // Chinese font styles -- PingFang SC/Songti SC/etc. are Apple's system
  // names, which is what matters here (this editor is iOS-only); the
  // Windows/Noto names are harmless no-ops if the WebView doesn't have them.
  { label: '黑体', value: '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  { label: '宋体', value: '"Songti SC", STSong, SimSun, "Noto Serif SC", serif' },
  { label: '楷体', value: '"Kaiti SC", STKaiti, KaiTi, "Noto Serif SC", serif' },
  { label: '仿宋', value: 'STFangsong, FangSong, "Noto Serif SC", serif' },
];

export default function RichTextEditor({ initialHtml, onChangeHtml, placeholder }: Props) {
  const editorRef = useRef<RichEditor>(null);

  const applyFont = (fontFamily: string) => {
    // command() runs arbitrary JS inside the editor's WebView with $ = document
    // -- same execCommand the web editor uses, applied to whatever is
    // currently selected there.
    editorRef.current?.command(`$.execCommand('fontName', false, '${fontFamily}')`);
  };

  return (
    <View>
      <RichToolbar
        editor={editorRef}
        actions={[
          actions.setBold,
          actions.setItalic,
          actions.setUnderline,
          actions.heading2,
          actions.insertBulletsList,
          actions.insertOrderedList,
        ]}
        style={styles.toolbar}
        selectedIconTint={colors.primary}
        iconTint={colors.textDim}
      />
      <View style={styles.fontRow}>
        {FONT_CHOICES.map((font) => (
          <Pressable key={font.label} style={styles.fontButton} onPress={() => applyFont(font.value)}>
            <Text style={styles.fontButtonText}>{font.label}</Text>
          </Pressable>
        ))}
      </View>
      <RichEditor
        ref={editorRef}
        initialContentHTML={initialHtml}
        onChange={onChangeHtml}
        placeholder={placeholder}
        style={styles.editor}
        editorStyle={{ contentCSSText: 'font-size: 16px; min-height: 250px;' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { backgroundColor: colors.chip, borderRadius: 12, marginBottom: 8 },
  fontRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  fontButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.chip },
  fontButtonText: { fontSize: 12, color: colors.textDim },
  editor: { minHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 8 },
});
