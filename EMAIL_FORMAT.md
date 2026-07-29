.backend-shell {
  display: grid;
  gap: 16px;
}

.backend-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  flex-wrap: wrap;
}

.backend-head h2 {
  color: #30379f;
  margin-bottom: 4px;
}

.backend-head p {
  color: #667085;
  font-size: 13px;
  max-width: 760px;
}

.backend-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.backend-actions button {
  border: 1px solid #c9ceea;
  border-radius: 8px;
  padding: 9px 13px;
  background: #30379f;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.backend-actions button.secondary {
  background: #fff;
  color: #30379f;
}

#tikeeBackendIdentity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11px;
  color: #667085;
}

#tikeeBackendIdentity strong {
  color: #25314d;
}

.backend-status {
  display: flex;
  align-items: center;
  gap: 11px;
  border: 1px solid #e3e7f1;
  border-radius: 11px;
  background: #fff;
  padding: 13px 15px;
}

.backend-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #98a2b3;
  box-shadow: 0 0 0 4px #f2f4f7;
  flex: 0 0 auto;
}

.backend-status > div:last-child {
  display: flex;
  flex-direction: column;
}

.backend-status strong {
  color: #25314d;
  font-size: 13px;
}

.backend-status span {
  color: #667085;
  font-size: 11px;
}

.backend-status.success .backend-status-dot {
  background: #12a576;
  box-shadow: 0 0 0 4px #dcf8ec;
}

.backend-status.warning .backend-status-dot {
  background: #f2a20c;
  box-shadow: 0 0 0 4px #fff3d7;
}

.backend-status.error .backend-status-dot {
  background: #d94b43;
  box-shadow: 0 0 0 4px #fee9e7;
}

.backend-status.loading .backend-status-dot {
  background: #5d6fff;
  box-shadow: 0 0 0 4px #e8ebff;
  animation: backendPulse 1.1s infinite ease-in-out;
}

@keyframes backendPulse {
  50% {
    transform: scale(0.72);
    opacity: 0.65;
  }
}

.backend-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.backend-kpi {
  border: 1px solid #e7eaf2;
  border-radius: 10px;
  background: #fff;
  padding: 14px 15px;
}

.backend-kpi span {
  display: block;
  color: #7a849b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.backend-kpi strong {
  display: block;
  color: #172033;
  font-size: 21px;
  margin-top: 3px;
}

.backend-panel {
  border: 1px solid #e7eaf2;
  border-radius: 11px;
  background: #fff;
  padding: 15px;
}

.backend-panel h3 {
  color: #30379f;
  font-size: 13px;
  margin-bottom: 10px;
}

.backend-ingestion-head,
.backend-ingestion-row {
  display: grid;
  grid-template-columns: 125px 100px 70px minmax(220px, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px 9px;
  font-size: 10.5px;
}

.backend-ingestion-head {
  color: #667085;
  background: #f4f6fb;
  border-radius: 7px;
  font-weight: 800;
  text-transform: uppercase;
}

.backend-ingestion-row {
  color: #475467;
  border-bottom: 1px solid #eef0f5;
}

.backend-pill {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 7px;
  background: #eef1ff;
  color: #3545a7;
  font-size: 9px;
  text-transform: uppercase;
}

.backend-pill.processed {
  background: #ddf8eb;
  color: #087451;
}

.backend-pill.failed,
.backend-pill.rejected {
  background: #fee9e7;
  color: #a02a22;
}

.backend-empty {
  color: #8a93a6;
  font-size: 11px;
  padding: 16px 4px;
}

#tikeeSetupNotice {
  display: none;
  background: #fff8e7;
  border: 1px solid #f5d992;
  border-left: 4px solid #f2a20c;
  border-radius: 8px;
  padding: 12px 14px;
  color: #6d5310;
  font-size: 11px;
}

.tikee-login-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    radial-gradient(circle at 20% 15%, rgba(93, 111, 255, 0.22), transparent 33%),
    linear-gradient(135deg, #f5f6ff, #eef6f3);
}

.tikee-login-card {
  width: min(420px, 100%);
  border: 1px solid #dfe3f4;
  border-radius: 18px;
  background: #fff;
  padding: 28px;
  box-shadow: 0 22px 60px rgba(36, 43, 130, 0.18);
}

.tikee-login-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #30379f;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tikee-login-brand div {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #5d6fff;
  color: #fff;
  font-size: 24px;
}

.tikee-login-card h2 {
  color: #172033;
  margin: 17px 0 3px;
}

.tikee-login-card > p {
  color: #667085;
  font-size: 12px;
  margin-bottom: 18px;
}

.tikee-login-card label {
  display: block;
  color: #475467;
  font-size: 11px;
  font-weight: 700;
  margin-top: 12px;
}

.tikee-login-card input {
  display: block;
  width: 100%;
  height: 43px;
  margin-top: 5px;
  border: 1px solid #d7dbe7;
  border-radius: 8px;
  padding: 9px 11px;
  font-size: 13px;
}

.tikee-login-card input:focus {
  outline: none;
  border-color: #5d6fff;
  box-shadow: 0 0 0 3px rgba(93, 111, 255, 0.12);
}

.tikee-login-card button {
  width: 100%;
  height: 43px;
  margin-top: 15px;
  border: 0;
  border-radius: 8px;
  background: #30379f;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

.tikee-login-card button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.tikee-login-message {
  min-height: 18px;
  color: #b2372e;
  font-size: 10.5px;
  margin-top: 8px;
}

@media (max-width: 760px) {
  .backend-kpis {
    grid-template-columns: 1fr;
  }

  .backend-ingestion-head {
    display: none;
  }

  .backend-ingestion-row {
    grid-template-columns: 1fr 1fr;
  }

  #tikeeBackendIdentity {
    align-items: flex-start;
    width: 100%;
  }
}
