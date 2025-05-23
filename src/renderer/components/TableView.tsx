import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useWindow } from "../contexts/WindowContext";

export interface Column {
  key: string;
  header: string;
  width?: number;
  render?: (
    row: Record<string, React.ReactNode>,
    index?: number,
  ) => React.ReactNode;
}

export type Row = Record<string, React.ReactNode>;

interface TableViewProps {
  columns: Column[];
  data: Row[];
  style?: React.CSSProperties;
  onRowSelect?: (index: number) => void;
  onRowDoubleClick?: (index: number) => void;
  initialSelectedIndex?: number;
}

export const TableView: React.FC<TableViewProps> = ({
  columns,
  data,
  onRowSelect,
  onRowDoubleClick,
  style,
  initialSelectedIndex,
}) => {
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(
    initialSelectedIndex ?? null,
  );
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(
    {},
  );
  const [resizing, setResizing] = useState<{
    key: string;
    startX: number;
    initialWidth: number;
    cursorOffset: number;
  } | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const { currentWindow } = useWindow();

  const sortedData = useMemo(() => {
    const dataCopy = [...data];

    if (sortConfig !== null) {
      dataCopy.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return dataCopy;
  }, [data, sortConfig]);

  const indexMap = useMemo(() => {
    return new Map<Row, number>(data.map((row, index) => [row, index]));
  }, [data]);

  const handleRowSelect = useCallback(
    (sortedDataIndex: number) => {
      if (onRowSelect) {
        onRowSelect(indexMap.get(sortedData[sortedDataIndex]));
      }

      setSelectedRowIndex(sortedDataIndex);
    },
    [onRowSelect, indexMap],
  );

  const handleSort = (columnKey: string) => {
    setSortConfig((currentSort) => ({
      key: columnKey,
      direction:
        currentSort?.key === columnKey && currentSort?.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!sortedData.length) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (selectedRowIndex === null) {
          // Select first row if nothing is selected
          handleRowSelect(0);
        } else if (selectedRowIndex < sortedData.length - 1) {
          // Move to next row
          handleRowSelect(selectedRowIndex + 1);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (selectedRowIndex === null) {
          // Select last row if nothing is selected
          handleRowSelect(sortedData.length - 1);
        } else if (selectedRowIndex > 0) {
          // Move to previous row
          handleRowSelect(selectedRowIndex - 1);
        }
        break;
      case "Escape":
        // Clear selection
        setSelectedRowIndex(null);
        break;
    }
  };

  useEffect(() => {
    // Focus the table container to enable keyboard navigation
    if (tableRef.current) {
      tableRef.current.focus();
    }

    // Add event listener for keyboard navigation
    currentWindow.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      currentWindow.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRowIndex, sortedData]);

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    const resizeHandle = e.currentTarget as HTMLElement;
    const handleRect = resizeHandle.getBoundingClientRect();
    const cursorOffset = e.clientX - handleRect.left;

    setResizing({
      key: columnKey,
      startX: e.clientX,
      initialWidth: columnWidths[columnKey] || 50,
      cursorOffset,
    });
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizing) return;

    const deltaX =
      e.clientX -
      resizing.cursorOffset -
      (resizing.startX - resizing.cursorOffset);
    const newWidth = Math.max(50, resizing.initialWidth + deltaX);

    setColumnWidths((prev) => ({
      ...prev,
      [resizing.key]: newWidth,
    }));
  };

  const handleResizeEnd = () => {
    setResizing(null);
  };

  useEffect(() => {
    if (resizing) {
      currentWindow.document.addEventListener("mousemove", handleResizeMove);
      currentWindow.document.addEventListener("mouseup", handleResizeEnd);
      return () => {
        currentWindow.document.removeEventListener(
          "mousemove",
          handleResizeMove,
        );
        currentWindow.document.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [resizing]);

  const getColumnWidth = (column: Column) => {
    if (columnWidths[column.key]) {
      return { width: `${columnWidths[column.key]}px` };
    }
    if (column.width !== undefined) {
      return { width: `${column.width}px` };
    }
    return { width: "auto" };
  };

  return (
    <div
      className="sunken-panel"
      style={{ ...style, outline: "none" }}
      ref={tableRef}
      tabIndex={0}
    >
      <table
        className="interactive"
        style={{ width: "100%", tableLayout: "fixed" }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  ...getColumnWidth(column),
                  position: "relative",
                  userSelect: "none",
                  cursor: "pointer",
                }}
                onClick={() => handleSort(column.key)}
              >
                {column.header}
                {sortConfig?.key === column.key && (
                  <span style={{ marginLeft: "4px" }}>
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: "4px",
                    cursor: "col-resize",
                    backgroundColor:
                      resizing?.key === column.key ? "#666" : "transparent",
                  }}
                  onMouseDown={(e) => handleResizeStart(e, column.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={selectedRowIndex === rowIndex ? "highlighted" : ""}
              onClick={() => handleRowSelect(rowIndex)}
              onDoubleClick={() => onRowDoubleClick?.(rowIndex)}
            >
              {columns.map((column) => (
                <td
                  key={`${rowIndex}-${column.key}`}
                  style={getColumnWidth(column)}
                >
                  {column.render
                    ? column.render(row, rowIndex)
                    : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
