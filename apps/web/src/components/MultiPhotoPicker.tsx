import { Camera, Images, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface MultiPhotoPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  help?: string;
  maxFiles?: number;
  required?: boolean;
  invalid?: boolean;
  validationField?: string;
}

interface PhotoPreview {
  file: File;
  url: string;
}

const maxFileBytes = 8 * 1024 * 1024;

export function MultiPhotoPicker({
  files,
  onChange,
  disabled = false,
  label = "Issue photos",
  help = "Open the camera or select several photos from your phone.",
  maxFiles = 10,
  required = false,
  invalid = false,
  validationField
}: MultiPhotoPickerProps) {
  const inputId = useId();
  const pickerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PhotoPreview[]>([]);
  const [message, setMessage] = useState("");
  const showRequiredError = required && invalid && files.length === 0;

  useEffect(() => {
    if (!showRequiredError) return;
    pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    pickerRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [showRequiredError]);

  useEffect(() => {
    const nextPreviews = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);
    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [files]);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const candidates = Array.from(selected).filter((file) => file.type.startsWith("image/") && file.size <= maxFileBytes);
    const rejectedCount = selected.length - candidates.length;
    const combined = [...files];
    candidates.forEach((file) => {
      const duplicate = combined.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified);
      if (!duplicate && combined.length < maxFiles) combined.push(file);
    });
    onChange(combined);
    if (rejectedCount > 0) {
      setMessage(`${rejectedCount} file${rejectedCount > 1 ? "s were" : " was"} skipped. Use image files up to 8 MB.`);
    } else if (files.length + candidates.length > maxFiles) {
      setMessage(`You can upload up to ${maxFiles} photos per work order.`);
    } else {
      setMessage("");
    }
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function removeFile(index: number) {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
    setMessage("");
  }

  return (
    <section ref={pickerRef} className={`multi-photo-picker${showRequiredError ? " is-invalid" : ""}`} role="group" aria-labelledby={`${inputId}-label`} aria-invalid={showRequiredError || undefined} aria-describedby={showRequiredError ? `${inputId}-error` : `${inputId}-help`} data-requester-field={validationField}>
      <div className="multi-photo-heading">
        <div>
          <strong id={`${inputId}-label`}><Camera size={16} aria-hidden="true" />{label}{required ? <span className="multi-photo-required">Required</span> : null}</strong>
          <span id={`${inputId}-help`}>{help}</span>
        </div>
        <small aria-live="polite">{files.length}/{maxFiles} photos · 8 MB each</small>
      </div>
      {showRequiredError ? <p id={`${inputId}-error`} className="error-line" role="alert">Add at least one before photo. You cannot submit this work order without a photo.</p> : null}
      <input
        id={inputId}
        ref={inputRef}
        className="visually-hidden-input"
        type="file"
        accept="image/*"
        multiple
        disabled={disabled || files.length >= maxFiles}
        onChange={(event) => addFiles(event.target.files)}
      />
      <input
        id={`${inputId}-camera`}
        ref={cameraInputRef}
        className="visually-hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled || files.length >= maxFiles}
        onChange={(event) => addFiles(event.target.files)}
      />
      <div className="multi-photo-actions">
        <button className="multi-photo-add camera" type="button" disabled={disabled || files.length >= maxFiles} onClick={() => cameraInputRef.current?.click()}>
          <Camera size={18} aria-hidden="true" />
          Open camera
        </button>
        <button className="multi-photo-add" type="button" disabled={disabled || files.length >= maxFiles} onClick={() => inputRef.current?.click()}>
          <Images size={18} aria-hidden="true" />
          {files.length ? "Add more photos" : "Choose photos"}
        </button>
      </div>
      {previews.length ? (
        <div className="multi-photo-preview" aria-label="Selected photo previews">
          {previews.map((preview, index) => (
            <figure key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
              <img src={preview.url} alt={`Selected photo ${index + 1}`} />
              <figcaption>{preview.file.name}</figcaption>
              <button type="button" disabled={disabled} onClick={() => removeFile(index)} aria-label={`Remove ${preview.file.name}`}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      {message ? <p className="multi-photo-message" role="status">{message}</p> : null}
    </section>
  );
}
