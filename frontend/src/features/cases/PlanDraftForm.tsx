import { useRef, useState, type FormEvent } from 'react';
import { saveDraft } from '../../api/cases';
import { orMissing } from '../../api/labels';
import type { CaseDetail, CatalogItem } from '../../api/types';
import { FormMessage } from '../../components/Feedback';
import { RequiredNotice, TextAreaField } from '../../components/FormFields';
import { TextField } from '../../components/TextField';
import { CatalogSearch } from '../catalog/CatalogSearch';
import { checkDate, minDate } from '../../dates';
import { useUnsavedChanges } from '../../router';
import type { SaveHandlers } from './CaseDetailPage';
import { interpretSaveError } from './saveErrors';

const MAX_SERVICES = 5;
const GOAL_MAX = 200;

type Props = { detail: CaseDetail } & SaveHandlers;
type Field = 'preparedOn' | 'goal' | 'serviceIds';

/**
 * 읍면동 지원계획 초안(SAVE_DRAFT). 목표와 공단 서비스 1~5개를 저장한다.
 * 서비스는 계획 안의 공단 조회에서 고르며, 초안 저장 전까지 입력을 유지한다(D-02).
 */
export function PlanDraftForm({ detail, onSaved, onReload }: Props) {
  const [preparedOn, setPreparedOn] = useState(detail.plan?.preparedOn ?? '');
  const [goal, setGoal] = useState(detail.plan?.goal ?? '');
  const [services, setServices] = useState<CatalogItem[]>(detail.plan?.items.map((item) => item.catalog) ?? []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);

  /** 값을 고치면 그 칸의 오류 표시를 지운다(다시 검사는 저장할 때). */
  const clearError = (field: string) =>
    setErrors((current) => (current[field as keyof typeof current] ? { ...current, [field]: undefined } : current));
  const [saving, setSaving] = useState(false);
  const savedIds = detail.plan?.items.map((item) => item.catalog.id).join(',') ?? '';
  useUnsavedChanges(
    preparedOn !== (detail.plan?.preparedOn ?? '') ||
      goal.trim() !== (detail.plan?.goal ?? '') ||
      services.map((service) => service.id).join(',') !== savedIds,
  );
  const refs = {
    preparedOn: useRef<HTMLInputElement>(null),
    goal: useRef<HTMLTextAreaElement>(null),
    serviceIds: useRef<HTMLButtonElement>(null),
  };

  function addService(item: CatalogItem) {
    setServices((current) =>
      current.length >= MAX_SERVICES || current.some((service) => service.id === item.id) ? current : [...current, item],
    );
    setErrors((current) => ({ ...current, serviceIds: undefined }));
  }

  function removeService(id: string) {
    setServices((current) => current.filter((service) => service.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const next: Partial<Record<Field, string>> = {};
    next.preparedOn = checkDate(preparedOn, {
      required: '수립일을 입력해 주세요.',
      notBefore: { date: detail.assessment?.resultReceivedOn, label: '판정 수신일' },
    });
    if (goal.trim() === '') next.goal = '지원 목표를 입력해 주세요.';
    if (services.length === 0) next.serviceIds = '서비스를 1개 이상 선택해 주세요.';
    setErrors(next);
    const firstInvalid = (['preparedOn', 'goal', 'serviceIds'] as const).find((field) => next[field]);
    if (firstInvalid) {
      setMessage('입력값을 확인해 주세요.');
      refs[firstInvalid].current?.focus();
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveDraft(detail.id, {
        version: detail.version,
        preparedOn,
        goal: goal.trim(),
        serviceIds: services.map((service) => service.id),
      });
      setSaving(false);
      setSearchOpen(false);
      onSaved(saved, `지원계획 초안을 저장했습니다. 선택한 서비스 ${saved.plan?.items.length ?? 0}개`);
    } catch (error) {
      setSaving(false);
      const result = interpretSaveError(error);
      // serviceIds.1처럼 배열 경로로 오면 서비스 목록 오류로 보여준다.
      const field = result.field?.root;
      if (field === 'preparedOn' || field === 'goal' || field === 'serviceIds') {
        setErrors({ [field]: result.field!.message });
        refs[field].current?.focus();
      }
      setMessage(result.message);
      if (result.reload) onReload(result.message);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate aria-label="지원계획 초안">
      <RequiredNotice />
      {message && !(message === '입력값을 확인해 주세요.' && !Object.values(errors).some(Boolean)) && <FormMessage tone="error">{message}</FormMessage>}
      <TextField
        id="prepared-on"
        label="수립일"
        type="date"
        hint={detail.assessment ? `판정 수신일(${detail.assessment.resultReceivedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(detail.assessment?.resultReceivedOn)}
        value={preparedOn}
        onChange={(event) => { setPreparedOn(event.target.value); clearError('preparedOn'); }}
        error={errors.preparedOn}
        inputRef={refs.preparedOn}
      />
      <TextAreaField
        id="plan-goal"
        label="지원 목표"
        maxLength={GOAL_MAX}
        value={goal}
        onChange={(event) => { setGoal(event.target.value); clearError('goal'); }}
        error={errors.goal}
        textareaRef={refs.goal}
      />

      <div className="form-group">
        <div className="selected-head">
          <h3 className="sub-title" id="selected-services-title">
            선택한 서비스 ({services.length}/{MAX_SERVICES})
          </h3>
          <button
            ref={refs.serviceIds}
            type="button"
            className="krds-btn medium secondary"
            aria-expanded={searchOpen}
            aria-controls="plan-catalog-search"
            aria-describedby={errors.serviceIds ? 'service-ids-error' : undefined}
            onClick={() => setSearchOpen((open) => !open)}
          >
            {searchOpen ? '계획으로 돌아가기' : '서비스 검색'}
          </button>
        </div>
        {errors.serviceIds && (
          <p id="service-ids-error" className="form-hint-invalid">
            {errors.serviceIds}
          </p>
        )}
        {services.length === 0 ? (
          <p className="text-subtle">서비스를 선택하면 프로그램·기관·출처가 여기에 표시됩니다.</p>
        ) : (
          <ol className="plan-item-list" aria-labelledby="selected-services-title">
            {services.map((service, index) => (
              <li key={service.id} className="plan-item-row">
                <div>
                  <p className="plan-item-title">
                    {index + 1}. {orMissing(service.programName)}
                  </p>
                  <p>{orMissing(service.providerName)}</p>
                  <p className="text-subtle">
                    {orMissing(service.sourceName)} · {orMissing(service.referenceDate)} 기준
                  </p>
                </div>
                <div className="plan-item-actions">
                  <button type="button" className="krds-btn small tertiary" onClick={() => removeService(service.id)}>
                    빼기<span className="sr-only"> {orMissing(service.programName)}</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {searchOpen && (
        <div id="plan-catalog-search" className="plan-catalog">
          <h3 className="sub-title">공단 서비스·기관 조회</h3>
          {services.length >= MAX_SERVICES && (
            <p className="form-hint-information">서비스는 최대 {MAX_SERVICES}개까지 선택할 수 있습니다.</p>
          )}
          <CatalogSearch
            headingLevel="h3"
            initial={{ sido: detail.region.sido, sigungu: detail.region.sigungu }}
            pick={{
              selectedIds: services.map((service) => service.id),
              canAddMore: services.length < MAX_SERVICES,
              onSelect: addService,
            }}
          />
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={saving}>
          {saving ? '저장 중…' : '초안 저장'}
        </button>
      </div>
    </form>
  );
}
