// The interest catalogue and the suggested options for the other personalization kinds.
// Keys are stable slugs derived from the label; never rename a label without keeping its old key.

export interface InterestCategory { id: string; label: string }
export interface InterestItem { key: string; label: string; category: string }

export const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const RAW: Record<string, string[]> = {
  'Art': ['Drawing', 'Painting', 'Illustration', 'Sculpture', 'Digital art', 'Street art', 'Art history', 'Printmaking', 'Calligraphy', 'Comics and manga', 'Museums and galleries', 'Animation'],
  'Music': ['Singing', 'Songwriting', 'Producing beats', 'Guitar', 'Piano and keys', 'Drums and percussion', 'DJing', 'Afrobeats', 'Hip-hop', 'Classical music', 'Jazz', 'Indie and alternative', 'Gospel and worship', 'Live concerts'],
  'Writing': ['Creative writing', 'Poetry', 'Short stories', 'Blogging', 'Screenwriting', 'Journalism', 'Copywriting', 'Fan fiction', 'Spoken word', 'Newsletter writing', 'Memoir and personal essays'],
  'Books': ['Fiction', 'Non-fiction', 'Fantasy and sci-fi', 'Romance', 'Mystery and thrillers', 'Biographies', 'Self-development books', 'African literature', 'Book clubs', 'Audiobooks'],
  'Film and TV': ['Film making', 'Cinematography', 'Documentaries', 'Nollywood', 'Anime', 'K-drama', 'TV series', 'Film criticism', 'Video editing', 'Short films'],
  'Gaming': ['Console gaming', 'PC gaming', 'Mobile gaming', 'Esports', 'Game design', 'Indie games', 'Tabletop and board games', 'Role-playing games', 'Speedrunning', 'Streaming games', 'Retro games'],
  'Technology': ['Artificial intelligence', 'Web development', 'Mobile apps', 'Cybersecurity', 'Open source', 'Cloud computing', 'Data science', 'Gadgets', 'No-code tools', 'Blockchain and Web3', 'Cyber-safety and privacy', 'Tech news'],
  'Science': ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Neuroscience', 'Mathematics', 'Climate science', 'Citizen science', 'Space exploration', 'Earth science', 'Science communication'],
  'Engineering': ['Electronics', 'Robotics', 'Mechanical engineering', 'Civil engineering', 'Electrical engineering', 'Embedded systems', '3D printing', 'Renewable energy', 'Aerospace', 'Hardware hacking'],
  'Entrepreneurship': ['Starting a business', 'Startups', 'Side hustles', 'Social enterprise', 'Product management', 'Pitching and fundraising', 'E-commerce', 'Freelancing', 'Building in public', 'Small business'],
  'Business': ['Marketing', 'Sales', 'Brand strategy', 'Operations', 'Supply chain', 'Consulting', 'Project management', 'Business analytics', 'Customer experience', 'Negotiation'],
  'Career development': ['Interview skills', 'CV and portfolio building', 'Networking', 'Public speaking', 'Leadership', 'Remote work', 'Switching careers', 'Internships', 'Graduate schemes', 'Workplace skills', 'Personal branding'],
  'Relationships': ['Friendship', 'Dating and relationships', 'Family', 'Communication skills', 'Community building', 'Mentorship', 'Boundaries', 'Social confidence', 'Long-distance relationships'],
  'Culture': ['Languages and heritage', 'Festivals', 'Fashion and culture', 'Traditions', 'Cultural exchange', 'Diaspora stories', 'Folklore and mythology', 'Local history', 'Pop culture'],
  'Sports': ['Football', 'Basketball', 'Running', 'Athletics', 'Swimming', 'Cycling', 'Martial arts', 'Tennis', 'Gym and lifting', 'Yoga', 'Hiking', 'Cricket', 'Volleyball', 'Table tennis'],
  'Wellness': ['Mindfulness', 'Sleep habits', 'Nutrition', 'Movement and stretching', 'Stress management', 'Journaling', 'Digital wellbeing', 'Self-care routines', 'Meditation', 'Healthy habits'],
  'Volunteering': ['Community service', 'Tutoring and mentoring', 'Environmental clean-ups', 'Food banks', 'Charity events', 'Youth programmes', 'Disaster relief', 'Skills-based volunteering'],
  'Travel': ['Backpacking', 'City breaks', 'Road trips', 'Travel photography', 'Cultural travel', 'Budget travel', 'Studying abroad', 'Travel writing', 'Local exploring'],
  'Design': ['Graphic design', 'UI and UX design', 'Product design', 'Typography', 'Branding and identity', 'Interior design', 'Motion design', 'Architecture', 'Fashion design', 'Design systems'],
  'Photography': ['Portraits', 'Street photography', 'Landscape photography', 'Phone photography', 'Film photography', 'Photo editing', 'Wildlife photography', 'Event photography'],
  'Fashion': ['Streetwear', 'Thrifting', 'Sustainable fashion', 'Styling', 'Tailoring and sewing', 'Beauty and skincare', 'Accessories', 'Fashion history', 'Modest fashion'],
  'Finance': ['Budgeting', 'Saving', 'Investing basics', 'Credit and debt', 'Financial independence', 'Money mindset', 'Taxes basics', 'Cooperatives and savings groups', 'Financial literacy'],
  'Education': ['Study skills', 'Scholarships', 'Online courses', 'Teaching', 'Exam preparation', 'Lifelong learning', 'Academic writing', 'Coding bootcamps', 'Peer tutoring', 'Educational technology'],
  'Research': ['Research methods', 'Academic publishing', 'Data analysis', 'Literature reviews', 'Lab work', 'Social research', 'Open access', 'Grant writing', 'Citation and references', 'Interdisciplinary research'],
  'Community activities': ['Meetups', 'Clubs and societies', 'Hackathons', 'Open mics', 'Debate', 'Workshops', 'Hobby groups', 'Neighbourhood projects', 'Student unions', 'Volunteer committees'],
  'Food and cooking': ['Home cooking', 'Baking', 'Street food', 'Vegetarian and vegan', 'African cuisine', 'Meal prep', 'Coffee and tea', 'Food photography', 'Restaurants and cafes', 'Fermenting and preserving'],
  'Nature and environment': ['Climate action', 'Gardening', 'Wildlife', 'Recycling and upcycling', 'Renewable energy living', 'Conservation', 'Birdwatching', 'Camping', 'Sustainable living', 'Urban farming'],
  'Languages': ['English', 'French', 'Spanish', 'Yoruba', 'Igbo', 'Hausa', 'Swahili', 'Arabic', 'Mandarin', 'Portuguese', 'Sign language', 'Language exchange', 'Translation'],
  'History': ['World history', 'African history', 'Ancient civilisations', 'Military history', 'Women in history', 'Oral histories', 'Archaeology', 'Genealogy'],
  'Politics and civic life': ['Civic engagement', 'Public policy', 'Elections and voting', 'Human rights', 'Local government', 'Youth advocacy', 'Journalism and media literacy', 'International affairs', 'Law and justice'],
  'Spirituality and philosophy': ['Philosophy', 'Ethics', 'Faith and belief', 'Comparative religion', 'Stoicism', 'Ideas and debate', 'Meaning and purpose', 'Reflection'],
  'Crafts and making': ['Knitting and crochet', 'Woodworking', 'Pottery', 'Jewellery making', 'Upcycling', 'Paper crafts', 'Leatherwork', 'Maker spaces', 'DIY home projects', 'Candle and soap making'],
  'Animals': ['Dogs', 'Cats', 'Animal care', 'Wildlife rescue', 'Aquariums', 'Horses', 'Birds', 'Veterinary science'],
  'Cars and mobility': ['Cars', 'Motorbikes', 'Electric vehicles', 'Public transport', 'Bicycles and e-bikes', 'Aviation', 'Urban mobility', 'Car maintenance'],
  'Health and medicine': ['Public health', 'Nursing and care', 'First aid', 'Medical studies', 'Mental health awareness', 'Health tech', 'Sexual and reproductive health education', 'Fitness science'],
  'Law and society': ['Legal basics', 'Tenant and worker rights', 'Social justice', 'Data protection', 'Intellectual property for creators', 'Contracts basics'],
  'Home and living': ['Moving out', 'Flatsharing', 'Home organising', 'Budget decorating', 'Cooking for one', 'Life admin', 'Minimalism'],
  'Humour and fun': ['Memes', 'Stand-up comedy', 'Improv', 'Puzzles and trivia', 'Escape rooms', 'Karaoke', 'Quizzes'],
};

export const INTEREST_CATEGORIES: InterestCategory[] = Object.keys(RAW).map((label) => ({ id: slugify(label), label }));

export const INTERESTS: InterestItem[] = (() => {
  const seen = new Set<string>();
  const out: InterestItem[] = [];
  for (const [cat, items] of Object.entries(RAW)) {
    for (const label of items) {
      let key = slugify(label);
      if (seen.has(key)) key = `${slugify(cat)}-${key}`; // keep keys unique if two categories share a label
      seen.add(key);
      out.push({ key, label, category: slugify(cat) });
    }
  }
  return out;
})();

export interface Option { key: string; label: string }
const opts = (labels: string[]): Option[] => labels.map((label) => ({ key: slugify(label), label }));

export const LEARN_TOPICS: Option[] = opts([
  'Coding basics', 'Web development', 'Data and spreadsheets', 'Artificial intelligence', 'Design fundamentals', 'Writing clearly', 'Public speaking',
  'Personal finance', 'Starting a business', 'Marketing basics', 'Research skills', 'Study skills', 'Languages', 'Photography', 'Video and audio production',
  'Music theory', 'Leadership', 'Career planning', 'Critical thinking', 'Digital safety', 'Wellbeing habits', 'Science explained', 'History and society', 'Project management',
]);

export const CONTENT_CATEGORIES: Option[] = opts([
  'Short reads', 'Long-form articles', 'Videos', 'Podcasts and audio', 'Visual explainers', 'Tutorials and how-tos', 'Quizzes and games', 'Community discussions',
  'Creative showcases', 'News and updates', 'Research summaries', 'Opportunities and deadlines', 'Events', 'Memes and light moments', 'Stories from members',
]);

export const PARTICIPATION_STYLES: Option[] = opts([
  'Listen first', 'Ask questions', 'Share my work', 'Join discussions', 'Find collaborators', 'Mentor others', 'Find a mentor', 'Attend events',
  'Learn at my own pace', 'Join study groups', 'Post anonymously sometimes', 'Keep a private journal', 'Help moderate a community',
]);

export const CREATIVE_INTERESTS: Option[] = opts([
  'Visual art', 'Music making', 'Writing and poetry', 'Film and video', 'Photography', 'Game making', 'Design', 'Fashion', 'Crafts', 'Performance and theatre',
  'Podcasting', 'Comics and illustration', 'Animation', 'Architecture and spaces', 'Cooking as craft',
]);

export const CAREER_INTERESTS: Option[] = opts([
  'Software and tech', 'Data and AI', 'Design and creative industries', 'Healthcare', 'Education and teaching', 'Business and consulting', 'Finance', 'Law and policy',
  'Science and research', 'Engineering', 'Media and journalism', 'Non-profit and social impact', 'Entrepreneurship', 'Skilled trades', 'Public service', 'Sport and fitness',
  'Hospitality and events', 'Agriculture and environment',
]);

export const GOAL_SUGGESTIONS: Option[] = opts([
  'Learn a new skill', 'Find an internship', 'Get my first job', 'Build a portfolio', 'Start a project', 'Make new friends', 'Find a mentor', 'Improve my wellbeing',
  'Save money', 'Get into a scholarship', 'Publish my work', 'Learn a language', 'Grow a community', 'Explore career options',
]);

export const PERSONALIZATION_LIMITS = { perKind: 40, customLabelMax: 40 } as const;
