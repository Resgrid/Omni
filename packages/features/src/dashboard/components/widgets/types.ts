/** What the grid hands every widget. */
export interface WidgetProps {
  isEditMode: boolean;
  onRemove?: () => void;
  /** Opens this widget's settings (Configure screen). */
  onConfigure?: () => void;
  /** Pixel size of the widget's cell (layout choices such as horizontal forecasts). */
  width: number;
  height: number;
}
