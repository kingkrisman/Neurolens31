# Image provenance

Two kinds of image live here, and they are kept apart on purpose.

## Real photographs — `photos/`

From [Burst](https://burst.shopify.com), Shopify's free stock library, under
the Burst photo licence ("Shopify – Some Rights Reserved"): free for
commercial use and to modify, no attribution required, not to be resold as
photo files. Each is saved at 640, 1280, 1920, 2560 and 3840 pixels wide from
the 4K original, and served as a `srcset` (see `src/lib/photos.ts`), so a
browser downloads only the width its screen needs.

They show real people. Nothing presents them as evidence: the "How it lands"
section pairs three of them with situations, in the present tense, about what
the app does. Nobody pictured uses NeuroLens or is being quoted, and nothing
may imply they are.

| Files | Where on Explore | Photograph | Photographer |
| --- | --- | --- | --- |
| `turning-page-*` | Designed for attention, "Adaptive formatting" | [Person in grey sweater holds a book open, turning the page](https://burst.shopify.com/photos/person-in-grey-sweater-holds-a-book-open-turning-the-page) | Avelino Calvar Martinez |
| `sunlit-pages-*` | Designed for attention, "Focus-friendly rhythm" | [Sunlight on the pages of an open book](https://burst.shopify.com/photos/sunlight-on-the-pages-of-an-open-book) | Rahul Pandit |
| `book-spines-*` | Designed for attention, "Read your way" | [Antique books on shelves](https://burst.shopify.com/photos/antique-books-on-shelves) | Sarah Pflug |
| `desk-notes-*` | How it lands, graduate student | [Writing at desk](https://burst.shopify.com/photos/writing-at-desk) | Matthew Henry |
| `desk-brief-*` | How it lands, product team | [Man at desk looking at his newspaper](https://burst.shopify.com/photos/man-at-desk-looking-at-his-newspaper) | Matthew Henry |
| `sofa-reader-*` | How it lands, daily reader | [Relaxing and reading](https://burst.shopify.com/photos/relaxing-and-reading) | Sajjad Hussain M |
| `library-shelf-*` | Closing panel | [Antique books on a library shelf](https://burst.shopify.com/photos/antique-books-on-a-library-shelf) | Samantha Hurley |
| `glasses-linen-*` | Also in the app, "Highlights that come back" | [Spectacles on book](https://burst.shopify.com/photos/spectacles-on-book) | Matthew Henry |
| `lap-reader-*` | Your reading stays yours | [Person reading with the book open on their lap](https://burst.shopify.com/photos/person-reading-with-the-book-open-on-their-lap) | Avelino Calvar Martinez |

## AI-generated images — the files in this directory

These are **AI-generated**: none is a photograph or depicts a real person,
place or event, and none is licensed from a third party. They are decorative;
alt text describes what is shown, and no image carries information the text
beside it does not. They should not be used beside anything that reads as a
testimonial.

| File | Where |
| --- | --- |
| `hero-lens.jpg` | Explore hero (preloaded) |
| `reading-room.jpg` | Explore card under the hero; Insights; accessibility statement; a sample passage |
| `hands.jpg` | Thank-you page; a sample passage |
| `feature-books.jpg` | Library empty state; What's new; a sample passage |
| `nook.jpg` | A sample passage |

Eight further images were removed in September 2026: they were generated, never
referenced by any code, and cost 972 KB in every deploy. `case-team.jpg` and
`feature-focus.jpg` went later the same month, when real photographs replaced
them.
