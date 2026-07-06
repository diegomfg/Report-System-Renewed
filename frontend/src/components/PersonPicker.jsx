import { useState } from 'react';

export default function PersonPicker({ candidates, placeholder, onAdd }) {
    const [selected, setSelected] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!selected) return;
        setLoading(true);
        try {
            await onAdd(selected);
            setSelected('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="person-picker">
            <select value={selected} onChange={e => setSelected(e.target.value)}>
                <option value="">{placeholder}</option>
                {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <button className="btn-secondary" onClick={submit} disabled={!selected || loading}>
                Add
            </button>
        </div>
    );
}
