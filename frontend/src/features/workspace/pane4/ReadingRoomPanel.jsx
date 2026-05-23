/**
 * ReadingRoomPanel — Pane 4-5 Reading Mode 全面 Overlay wrapper (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L400-408 (旧 inline ReadingMode 配置)
 *
 * 機能: ReadingMode の小型 wrapper。 v101 Sprint B-E で PanelGroup を破棄、
 *   selected !== null 時に Pane 4 body 全面を占有する Linear/Gmail 流 overlay。
 *   close→list は store.closeReadingRoom で 1-click 回帰。
 *
 * Props:
 *   item       Item       - 表示対象記事 (store.activeReadingItem)
 *   onClose    () => void - store.closeReadingRoom
 *   jpEnabled  boolean    - useTranslation の jpEnabled
 */
import ReadingMode from './ReadingMode.jsx';

export default function ReadingRoomPanel({ item, onClose, jpEnabled }) {
  return (
    <ReadingMode
      item={item}
      onClose={onClose}
      jpEnabled={jpEnabled}
    />
  );
}
