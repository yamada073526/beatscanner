import React from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';

/**
 * Simple titled card section. Step 6 では 7 セクションのうち
 * Profile / Key Stats / IR Links / News / Beat-Miss を本コンポーネントで包む.
 */
export default function SimpleSection({ id, title, label, action, children, empty }) {
  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader id={id} title={title} label={label} action={action} />
        {empty ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{empty}</div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
