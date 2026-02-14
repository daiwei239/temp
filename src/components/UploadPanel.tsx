import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { getApiBaseUrl } from "../lib/backendUrl";

interface UploadPanelProps {
  onUploaded: (paperId: string) => void;
  onStartAnalyze: () => void;
  connected: boolean;
  hasPaper: boolean;
  statusText: string;
}

const UploadPanel = ({
  onUploaded,
  onStartAnalyze,
  connected,
  hasPaper,
  statusText,
}: UploadPanelProps) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);
      setFileName(file.name);

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/paper/upload`, {
          method: "POST",
          headers: { "x-filename": file.name },
          body: file,
        });
        const data = await response.json();
        onUploaded(data.paper_id);
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
      className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
    >
      <div
        {...getRootProps()}
        className={[
          "cursor-pointer rounded-2xl border border-dashed p-8 text-center transition-colors",
          isDragActive
            ? "border-blue-500 bg-blue-50/60"
            : "border-slate-300 bg-slate-50/70 hover:border-blue-300",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <h2 className="text-xl font-semibold text-slate-800">上传论文</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          拖拽 PDF 到这里，或点击选择文件开始分析。
        </p>
        {fileName && (
          <p className="mt-3 text-sm font-medium text-slate-700">已选择：{fileName}</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onStartAnalyze}
          disabled={!hasPaper || !connected || isUploading}
          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          开始结构化分析
        </button>
        <p className="text-sm text-slate-600">
          {isUploading ? "正在上传论文..." : statusText}
        </p>
      </div>
    </motion.section>
  );
};

export default UploadPanel;
