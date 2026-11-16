import { Link } from '../../router';
import { PageHead } from '../../layout/PageHead';

export function NotFoundPage({ home = '/cases' }: { home?: string }) {
  return (
    <div className="inner page">
      <PageHead parents={[{ label: '신청 목록', to: home }]} title="화면을 찾을 수 없습니다" />
      <p className="text-subtle">주소를 확인하거나 신청 목록으로 돌아가 주세요.</p>
      <p>
        <Link to={home} className="krds-btn medium secondary">
          신청 목록으로
        </Link>
      </p>
    </div>
  );
}
