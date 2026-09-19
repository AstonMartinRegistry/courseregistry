// Script to count courses with descriptions less than 30 words
// Usage: node scripts/count-short-descriptions.js [term]
//   e.g. node scripts/count-short-descriptions.js spring26

require('dotenv').config({ path: '.env.local' });

const term = process.argv[2] || "spring26";
const TABLE_BY_TERM = { spring26: "courses_spring26", winter26: "courses" };
const TABLE_NAME = TABLE_BY_TERM[term] || "courses_spring26";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local');
  process.exit(1);
}

async function countShortDescriptions() {
  try {
    console.log(`Fetching all courses from ${TABLE_NAME} (paginated)...`);

    const PAGE_SIZE = 1000;
    let allCourses = [];
    let from = 0;

    while (true) {
      const to = from + PAGE_SIZE - 1;

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=id,course_codes,course_title,course_descr`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Range': `${from}-${to}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
      }

      const batch = await response.json();
      allCourses = allCourses.concat(batch);

      console.log(`  Fetched ${batch.length} rows (total so far: ${allCourses.length})`);

      if (batch.length < PAGE_SIZE) {
        break; // last page
      }

      from += PAGE_SIZE;
    }

    const courses = allCourses;
    console.log(`\nTotal courses: ${courses.length}\n`);

    // Count words in description
    function countWords(text) {
      if (!text || typeof text !== 'string') {
        return 0;
      }
      // Split by whitespace and filter out empty strings
      return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    let shortDescriptionCount = 0;
    const shortDescriptionCourses = [];

    courses.forEach(course => {
      const wordCount = countWords(course.course_descr);
      if (wordCount < 30) {
        shortDescriptionCount++;
        shortDescriptionCourses.push({
          id: course.id,
          codes: course.course_codes,
          title: course.course_title,
          wordCount: wordCount,
        });
      }
    });

    console.log(`Courses with less than 30 words: ${shortDescriptionCount}`);
    console.log(`Percentage: ${((shortDescriptionCount / courses.length) * 100).toFixed(2)}%\n`);

    if (shortDescriptionCourses.length > 0) {
      console.log('Courses with short descriptions:');
      console.log('─'.repeat(80));
      shortDescriptionCourses.forEach(course => {
        console.log(`ID: ${course.id} | ${course.codes} | Words: ${course.wordCount}`);
        if (course.title) {
          console.log(`  Title: ${course.title}`);
        }
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

countShortDescriptions();

