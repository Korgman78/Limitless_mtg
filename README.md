# Limitless - MTG Limited Analytics

**Limitless** is a modern, high-performance analytics platform for Magic: The Gathering Limited formats (Draft & Sealed). Built with **React 19** and **Vite**, it leverages data from **17Lands** to provide players with deep insights into the metagame, card performance, and strategic trends.

![Limitless Banner](public/og-image.png)

## 🚀 Key Features

### 1. 📊 Metagame Breakdown
Analyze the health and shape of the format with precision.
- **Archetype Stats**: Real-time win rates and play rates for all color combinations.
- **Trend Tracking**: Sparklines visualize performance history over the last 14 days.
- **Format Blueprint**: Advanced analysis including a "Prince-O-Meter" to determine if a format is driven by bombs (Princes) or synergy/commons (Paupers).
- **Interactive Charts**: Visualizations for metagame share and color pair performance.

### 2. 🃏 Card Ratings Engine
A powerful interface to evaluate individual card strength.
- **Advanced Metrics**: View GIH WR (Game In-Hand Win Rate), ALSA (Average Last Seen At), and improvement trends.
- **Smart Filtering**: Filter by colors, rarity, and search by name.
- **Matrix View**: A dense, grid-based view for comparative analysis of archetypes.
- **Detail Overlay**: Deep dive into specific cards with historical trend graphs.

### 3. ⚖️ Format Comparison
Understand how cards perform differently across formats.
- **Cross-Format Analysis**: Compare stats between Premier Draft, Traditional Draft, and Sealed.
- **Delta Highlighting**: Quickly spot cards that are significantly better or worse in specific formats (e.g., "Bo1 vs Bo3").

### 4. 📰 Press Review & Community
Stay updated with the latest strategic content.
- **Curated Articles**: Aggregates videos and articles from top Limited content creators.
- **Smart Context**: Automatically detects card names in summaries to provide instant hover previews.
- **Community Voting**: "Yes/Meh/No" voting system to highlight high-value strategic guides.

---

## 🛠 Technical Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: TailwindCSS + PostCSS
- **Animations**: Framer Motion
- **State/Data**: TanStack Query (React Query)
- **Icons**: Lucide React
- **Hosting**: Vercel

### Backend & Data Pipeline
- **Database**: Supabase (PostgreSQL)
- **ETL Pipeline**: Custom Python script (`backend/etl_script.py`)
- **Automation**: GitHub Actions (`daily_etl.yml`) runs the ETL daily to fetch fresh data from 17Lands.
- **Source**: Public data from [17Lands](https://www.17lands.com).

## ⚙️ Setup & Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## 📝 License

Limitless is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
