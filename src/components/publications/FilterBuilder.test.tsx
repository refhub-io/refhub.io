import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilterRuleEditor, type PublicationFilter } from './FilterBuilder';

const existingFilter: PublicationFilter[] = [
  { id: 'f1', field: 'title', operator: 'contains', value: '' },
];

describe('FilterRuleEditor — filterableFields', () => {
  it('offers every field by default', () => {
    render(<FilterRuleEditor filters={existingFilter} onFiltersChange={() => {}} tags={[]} vaults={[]} />);

    fireEvent.click(screen.getAllByRole('combobox')[0]);

    expect(screen.getByRole('option', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vault' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Reading State' })).toBeInTheDocument();
  });

  it('restricts the field picker to the given subset', () => {
    render(
      <FilterRuleEditor
        filters={existingFilter}
        onFiltersChange={() => {}}
        tags={[]}
        vaults={[]}
        filterableFields={['title', 'authors', 'year', 'journal', 'tags', 'publication_type', 'doi']}
      />,
    );

    fireEvent.click(screen.getAllByRole('combobox')[0]);

    expect(screen.getByRole('option', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Authors' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Vault' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Reading State' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Important' })).not.toBeInTheDocument();
  });

  it('defaults a newly added filter to the first allowed field', () => {
    let filters: PublicationFilter[] = [];
    const onFiltersChange = (next: PublicationFilter[]) => {
      filters = next;
    };

    const { rerender } = render(
      <FilterRuleEditor
        filters={filters}
        onFiltersChange={onFiltersChange}
        tags={[]}
        vaults={[]}
        filterableFields={['year', 'journal']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
    rerender(
      <FilterRuleEditor
        filters={filters}
        onFiltersChange={onFiltersChange}
        tags={[]}
        vaults={[]}
        filterableFields={['year', 'journal']}
      />,
    );

    expect(filters).toHaveLength(1);
    expect(filters[0].field).toBe('year');
  });
});
