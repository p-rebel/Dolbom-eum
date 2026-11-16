import { useState } from 'react';
import { DOCUMENTS, type DocumentKind } from '../../api/registration';

export function DocumentViewer({ urls }: { urls: Record<DocumentKind, string> }) {
  const [kind, setKind] = useState<DocumentKind>('application');
  return (
    <section className="registration-documents" aria-label="제출 서류">
      <div className="registration-document-controls">
        <div className="registration-document-tabs" role="group" aria-label="서류 선택">
          {(['application', 'privacy-consent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={'krds-btn medium ' + (kind === option ? 'primary' : 'secondary')}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {DOCUMENTS[option]}
            </button>
          ))}
        </div>
        <a href={urls[kind]} target="_blank" rel="noreferrer" className="registration-text-link">새 창에서 열기</a>
      </div>
      <iframe key={kind} className="registration-document-frame" title={DOCUMENTS[kind] + ' PDF'} src={urls[kind]} />
    </section>
  );
}
