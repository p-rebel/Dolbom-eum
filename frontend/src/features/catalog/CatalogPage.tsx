import { PageHead } from '../../layout/PageHead';
import { CatalogSearch } from './CatalogSearch';

/** UI-05 독립 조회 화면. 계획에 추가하는 버튼은 표시하지 않는다(D-02:57). */
export function CatalogPage() {
  return (
    <div className="inner page">
      <PageHead title="공단 서비스·기관 조회" />
      <CatalogSearch initial={{ sido: '', sigungu: '' }} />
    </div>
  );
}
