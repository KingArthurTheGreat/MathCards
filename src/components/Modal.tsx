import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  text,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const busy = useRef(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{text}</p>
      <div className="modal-actions">
        <button onClick={onClose}>Отмена</button>
        <button
          className="danger"
          onClick={async () => {
            if (busy.current) return;
            busy.current = true;
            try {
              await onConfirm();
            } finally {
              busy.current = false;
            }
          }}
        >
          Удалить
        </button>
      </div>
    </Modal>
  );
}
