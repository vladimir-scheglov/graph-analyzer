import type { FC } from 'react';
import { GroupComponentsEditor } from '../components/GroupComponentsEditor';

interface Props {
    viewId: string;
    group: any;
}

export const FormForm: FC<Props> = ({ viewId, group }) => {
    const components = group.components ?? [];
    return (
        <GroupComponentsEditor
            viewId={viewId}
            groupId={group.id}
            components={components}
            allowedKinds={['widget', 'block']}
        />
    );
};