import { useState } from 'react'
import { Search, FileText, Code, X } from 'lucide-react'

interface SearchResult {
  file: string
  line: number
  content: string
  matches: number
}

export function SearchPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    // Simulate search - in a real implementation, this would search through files
    setTimeout(() => {
      const mockResults: SearchResult[] = [
        {
          file: 'main.py',
          line: 15,
          content: 'def process_data(data):',
          matches: 1
        },
        {
          file: 'utils.py',
          line: 42,
          content: '    return process_data(result)',
          matches: 1
        }
      ]
      setSearchResults(mockResults)
      setIsSearching(false)
    }, 500)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search Header */}
      <div className="search-panel-header">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">SEARCH</span>
        </div>
      </div>

      {/* Search Input */}
      <div className="search-panel-input">
        <div className="search-input-container">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search in files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="search-clear"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={!searchQuery.trim() || isSearching}
          className="search-button"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Search Results */}
      <div className="search-results flex-1 overflow-auto">
        {searchResults.length === 0 && !isSearching ? (
          <div className="p-4 text-center text-[var(--muted)]">
            <Search size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No search results</p>
            <p className="text-xs mt-1">Enter a search query to find files</p>
          </div>
        ) : (
          <div className="p-2">
            {searchResults.map((result, index) => (
              <div key={index} className="search-result-item">
                <div className="search-result-header">
                  <FileText size={12} className="text-[var(--muted)]" />
                  <span className="search-result-file">{result.file}</span>
                  <span className="search-result-line">:{result.line}</span>
                  <span className="search-result-matches">{result.matches} match</span>
                </div>
                <div className="search-result-content">
                  <Code size={12} className="text-[var(--muted)]" />
                  <span className="search-result-text">{result.content}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
