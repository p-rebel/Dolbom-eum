import { useRef, useState, type FormEvent } from 'react';
import { saveDraft } from '../../api/cases';
import { orMissing } from '../../api/labels';
import type { CaseDetail, CatalogItem } from '../../api/types';
import { FormMessage } from '../../components/Feedback';
import { Modal } from '../../components/Modal';
import { RequiredNotice, TextAreaField } from '../../components/FormFields';
import { DateField } from '../../components/DateField';
import { CatalogSearch } from '../catalog/CatalogSearch';
import { checkDate, minDate } from '../../dates';
import { useUnsavedChanges } from '../../router';
import type { SaveHandlers } from './CaseDetailPage';
import { useFieldErrors } from './fieldErrors';
import { interpretSaveError } from './saveErrors';

const MAX_SERVICES = 5;
const GOAL_MAX = 200;

type Props = { detail: CaseDetail } & SaveHandlers;
type Field = 'preparedOn' | 'goal' | 'serviceIds';

/**
 * 읍면동 지원계획 초안(SAVE_DRAFT). 목표와 공단 서비스 1~5개를 저장한다.
 * 서비스는 ‘서비스 추가’ 창(KRDS 모달)의 공단 조회에서 고르며, 초안 저장 전까지 입력을 유지한다(D-02).
 * 계획 화면에는 고른 목록만 두어 계획과 검색 영역이 섞이지 않게 한다.
 */
export function PlanDraftForm({ detail, onSaved, onReload }: Props) {
  const [preparedOn, setPreparedOn] = useState(detail.plan?.preparedOn ?? '');
  const [goal, setGoal] = useState(detail.plan?.goal ?? '');
  const [services, setServices] = useState<CatalogItem[]>(detail.plan?.items.map((item) => item.catalog) ?? []);
  const [searchOpen, setSearchOpen] = useState(false);
  const { errors, setErrors, clearError: clearFieldError, message, setMessage } = useFieldErrors<Field>();
  // 저장된 초안과 같아 저장하지 않았다는 안내. 값을 고치면 지운다.
  const [info, setInfo] = useState<string | null>(null);
  const clearError = (...fields: Field[]) => {
    setInfo(null);
    clearFieldError(...fields);
  };
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
    clearError('serviceIds');
  }

  function removeService(id: string) {
    setServices((current) => current.filter((service) => service.id !== id));
    setInfo(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setInfo(null);
    // 저장된 초안과 같으면 저장하지 않는다. 저장하면 버전과 처리 이력만 늘고 바뀐 내용이 없다.
    if (
      detail.plan &&
      preparedOn === detail.plan.preparedOn &&
      goal.trim() === detail.plan.goal &&
      services.map((service) => service.id).join(',') === savedIds
    ) {
      setErrors({});
      setMessage(null);
      setInfo('저장된 초안과 같아 저장하지 않았습니다. 바꿀 내용을 고친 뒤 저장해 주세요.');
      return;
    }
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
      setMessage('입력값을 확인해 주세요.', true);
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
        setMessage(result.message, true);
      } else {
        setMessage(result.message);
      }
      if (result.reload) onReload(result.message);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate aria-label="지원계획 초안">
      <RequiredNotice />
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <DateField
        id="prepared-on"
        label="수립일"
        hint={detail.assessment ? `판정 수신일(${detail.assessment.resultReceivedOn})과 같거나 이후 날짜` : undefined}
        min={minDate(detail.assessment?.resultReceivedOn)}
        value={preparedOn}
        onChange={(value) => { setPreparedOn(value); clearError('preparedOn'); }}
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
            선택한 서비스 <span className="selected-count">{services.length}/{MAX_SERVICES}</span>
          </h3>
          <button
            ref={refs.serviceIds}
            type="button"
            className="krds-btn medium secondary"
            aria-haspopup="dialog"
            aria-describedby={errors.serviceIds ? 'service-ids-error' : undefined}
            onClick={() => setSearchOpen(true)}
          >
            서비스 추가
          </button>
        </div>
        {services.length === 0 ? (
          <p className="selected-empty">‘서비스 추가’를 눌러 공단 서비스를 1~{MAX_SERVICES}개 고릅니다.</p>
        ) : (
          <ol className="selected-list" aria-labelledby="selected-services-title">
            {services.map((service, index) => (
              <li key={service.id}>
                <span className="selected-index" aria-hidden="true">{index + 1}</span>
                <div className="selected-body">
                  <p className="selected-title">
                    {orMissing(service.programName)}
                    <span className="selected-provider">{orMissing(service.providerName)}</span>
                  </p>
                  <p className="selected-meta">
                    {orMissing(service.sourceName)} · {orMissing(service.referenceDate)} 기준
                  </p>
                </div>
                <button type="button" className="krds-btn small text" onClick={() => removeService(service.id)}>
                  빼기<span className="sr-only"> {orMissing(service.programName)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {errors.serviceIds && (
          <p id="service-ids-error" className="form-hint-invalid">
            {errors.serviceIds}
          </p>
        )}
      </div>

      {searchOpen && (
        <Modal
          title="공단 서비스 추가"
          size="lg"
          onClose={() => setSearchOpen(false)}
          actions={
            <button type="button" className="krds-btn medium primary" onClick={() => setSearchOpen(false)}>
              선택 완료 ({services.length}/{MAX_SERVICES})
            </button>
          }
        >
          <p className="modal-lead">
            고른 서비스는 계획에 바로 추가됩니다(최대 {MAX_SERVICES}개). 저장은 계획 화면의 ‘초안 저장’으로 합니다.
          </p>
          {services.length >= MAX_SERVICES && (
            <p className="form-hint-information">서비스 {MAX_SERVICES}개를 모두 골랐습니다. 다른 서비스를 고르려면 고른 서비스의 ‘빼기’를 눌러 하나를 빼 주세요.</p>
          )}
          <CatalogSearch
            compact
            headingLevel="h3"
            initial={{ sido: detail.region.sido, sigungu: detail.region.sigungu }}
            pick={{
              selectedIds: services.map((service) => service.id),
              canAddMore: services.length < MAX_SERVICES,
              onSelect: addService,
              onDeselect: removeService,
            }}
          />
        </Modal>
      )}

      {/* 저장하지 않은 이유는 방금 누른 저장 버튼 바로 위에 알린다. */}
      {info && <FormMessage tone="info">{info}</FormMessage>}
      <div className="form-actions">
        <button type="submit" className="krds-btn xlarge primary" disabled={saving}>
          {saving ? '저장 중…' : '초안 저장'}
        </button>
      </div>
    </form>
  );
}
