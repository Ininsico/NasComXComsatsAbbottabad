import { CloudUpload, Download, FileText, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import AsyncSection from '../components/AsyncSection.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { ADMIN_ROLE } from '../data/site.js';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatBytes, formatDateTime } from '../lib/format.js';

const SCOPE_LABELS = {
  own: 'Your uploads',
  wards: 'Documents for your ward',
  all: 'Every document on the campus',
};

export default function Documents() {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const loadDocuments = useCallback(() => api.documents(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadDocuments);

  const fileInput = useRef(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const documents = data?.documents ?? [];
  const canUpload = Boolean(data?.canUpload);
  const storageReady = data?.storageConfigured !== false;

  async function handleUpload(event) {
    event.preventDefault();

    const file = fileInput.current?.files?.[0];

    if (!file) {
      showToast({
        tone: 'pending',
        title: 'Choose a file',
        message: 'Pick a file to upload first.',
      });
      return;
    }

    setUploading(true);

    try {
      await api.uploadDocument(token, { file, title: title.trim() });
      showToast({
        tone: 'success',
        title: 'Uploaded',
        message: `${file.name} is now on the campus drive.`,
      });
      setTitle('');
      if (fileInput.current) fileInput.current.value = '';
      reload();
    } catch (uploadError) {
      showToast({ tone: 'error', title: 'Upload failed', message: uploadError.message });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(document) {
    try {
      await api.removeDocument(token, document.id);
      showToast({ tone: 'success', title: 'Removed', message: `${document.title} was deleted.` });
      reload();
    } catch (removeError) {
      showToast({ tone: 'error', title: 'Could not remove', message: removeError.message });
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Documents</h1>
          <p>{SCOPE_LABELS[data?.scope] ?? 'Campus files'} · {documents.length} file(s)</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <Download size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {!storageReady ? (
        <p className="alert alert--pending" style={{ marginBottom: '1.25rem' }}>
          <CloudUpload size={15} aria-hidden="true" />
          Cloudinary is not configured on the server, so uploads are disabled.
        </p>
      ) : null}

      {canUpload ? (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <span className="label-micro">Upload a file</span>
          <h3 style={{ marginTop: '0.25rem' }}>Stored on Cloudinary, listed for your teachers</h3>

          <form className="doc-upload" onSubmit={handleUpload}>
            <div className="field">
              <label htmlFor="doc-title">Title (optional)</label>
              <input
                id="doc-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Assignment 3 — database design"
              />
            </div>

            <div className="field">
              <label htmlFor="doc-file">File (max 8 MB)</label>
              <input id="doc-file" className="input" type="file" ref={fileInput} />
            </div>

            <button type="submit" className="btn btn-primary" disabled={uploading}>
              <Upload size={15} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </section>
      ) : (
        <p className="alert alert--info" style={{ marginBottom: '1.5rem' }}>
          <FileText size={15} aria-hidden="true" />
          Your account is read-only. Uploads are made by students, faculty and administrators.
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        shape="rows"
        count={4}
        label="Loading documents"
        errorTitle="We could not load the document list"
      >
        {documents.length === 0 ? (
          <p className="alert alert--info">
            <FileText size={15} aria-hidden="true" />
            No documents yet. {canUpload ? 'Upload the first one above.' : ''}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>Files on the campus drive</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Size</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col">File</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const canRemove = document.ownerId === user.id || user.role === ADMIN_ROLE;

                  return (
                    <tr key={document.id}>
                      <th scope="row">{document.title}</th>
                      <td>
                        {document.ownerName}
                        <span className="hint" style={{ display: 'block' }}>
                          {document.ownerRole}
                        </span>
                      </td>
                      <td>{formatBytes(document.bytes)}</td>
                      <td>{formatDateTime(document.createdAt)}</td>
                      <td>
                        <a href={document.url} target="_blank" rel="noreferrer">
                          <Download size={13} aria-hidden="true" /> Open
                        </a>
                      </td>
                      <td>
                        {canRemove ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={() => handleRemove(document)}
                            aria-label={`Remove ${document.title}`}
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AsyncSection>
    </>
  );
}
