﻿import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { getApiBaseUrl } from "../lib/backendUrl";

interface UploadPanelProps {
  onUploaded: (paperId: string) => void;
  onStartAnalyze: () => void;
  connected: boolean;
  hasPaper: boolean;
  statusText: string;
  compact?: boolean;
}

const UploadPanel = ({
  onUploaded,
  onStartAnalyze,
  connected,
  hasPaper,
  statusText,
  compact = false,
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
      className={[
        "rounded-3xl border border-slate-200 bg-slate-50 transition-all duration-500",
        compact ? "mx-auto max-w-3xl p-4 md:p-5" : "p-7",
      ].join(" ")}
    >
      <div
        {...getRootProps()}
        className={[
          "cursor-pointer rounded-2xl border border-dashed text-center transition-all duration-500",
          compact ? "p-4 md:p-5" : "p-8",
          isDragActive
            ? "border-blue-500 bg-blue-50/60"
            : "border-slate-300 bg-slate-50/70 hover:border-blue-300",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <h2 className={`font-semibold text-slate-800 ${compact ? "text-lg" : "text-xl"}`}>上传论文</h2>
        <p className={`mt-2 leading-6 text-slate-600 ${compact ? "text-xs md:text-sm" : "text-sm"}`}>
          拖拽 PDF 到这里，或点击选择文件开始分析。
        </p>
        {fileName && (
          <p className={`mt-2 font-medium text-slate-700 ${compact ? "text-xs md:text-sm" : "text-sm"}`}>已选择：{fileName}</p>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-3 ${compact ? "mt-3" : "mt-5"}`}>
        <button
          type="button"
          onClick={onStartAnalyze}
          disabled={!hasPaper || !connected || isUploading}
          className={`btn-primary rounded-full bg-[#8DAFDD] font-medium text-[#6e4a3a] transition hover:bg-[#7FA2D2] disabled:cursor-not-allowed disabled:bg-[#C9D8EC] ${
            compact ? "px-4 py-2 text-xs md:text-sm" : "px-5 py-2.5 text-sm"
          }`}
        >
          开始结构化分析
        </button>
        <p className={`${compact ? "text-xs md:text-sm" : "text-sm"} text-slate-600`}>
          {isUploading ? "正在上传论文..." : statusText}
        </p>
      </div>
    </motion.section>
  );
};

export default UploadPanel;
