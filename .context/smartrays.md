# Smartrays Solutions CMS

## Modules we need and things i have to need in the project

### Leads Management System

- [website, manually, bulk import excel/CSV , export excel/CSV,]
- Leads table columns [created(date,time),
- stage (dropdown{new,contacted, qualitfied, proposal send, Negociation, Won, Lost}),
- Budget ,
- Follow ups,
- Business Stage (new, old, stable),
- Contact(name , number{with copy button}),
- Action(mark as hot icon , user icon to assign the leads, call icon to call that lead) click on the profile open a profile details page].
- We need here Log Call Option with notes

### Monthly Transport System

- [How much Employee Travel with Google Map , we have to calculate the KM of employee travel],

### Attendance of employee

- [check in | check out | Leave Apply | Salary Calculation (we provide one paid leave only) |]

### Support

- [client call to the support [amdin and manager] they rasise issue ticket and assign to a employee form the list]

### Ticket raise

- [admin and manager can create / raise the ticket and can assign to the employee and employee see this on own dashboard and check quary and work on it] , Ticket should be have status [new project, old client query]

### Lead have a button to convert the lead to customer (ask things already present in the lead and admin can edit the things during the converting) after the converting this automatically a project will create on the Project with this details same for the manual

### While add a customer or converting to customer we need field to select a project manager from the dropdown

### Manager / Admin can add team members to that project

### Reports CMS with downloadable format (pdf)

### 10. Customer side Dashboard :-

- To raise the issue/tickets check status, and maintain ticket history [Only admin / Project manager can see this]

### Employee Module with own Dashboard

- It can only see own task assign by manager or admin
- After the login app pick the location of the device and after the logout time tracking off [pick both location login, and logout]
- Assign task have a button to start , and after click one task start button other button grayed out disable before stop currently working task, one task at a time

### Project Manager Module with Own Dashboard

### Sale Associates Module with Own Dashboard

### Exceutives

### Attendance for all

- Report deownloadable pdf excel
-

### Leave

- Amdin will approve but visible to manager also of there own team
- If Executive Take the leave without system approval and admin has to mark him absent it should be count 2 days leave

### Permission Module

- Admin can assign permission which can see what part of the own dashboard

### Salary Calculation / Payroll

- Acccording to attendacne and leave with working hours
- According the number of days in a month
- Salary get paid on the first day of every month

### Payment Tab only admin

- Select client (dropdown + manual) , date , Amount manual entry , notes,

### AMC (Annual Maintain Charges) ask which create client or convert client

<!-- ----------------------------------------------------------------------------- -->

### Notes

- Login time have we need two things [Location , and Photo of the location] , to know from where we are login, but they cannot upload the image, photo click on the real time
- If network issue / logout have on the phone during the shift time, show that login area and networkd backend area between off time mark red

<!-- ------------------------------------------------------------------------------- -->
### Tech Stack

#### Backend
- Node.js (Latest LTS)
- Express.js (ES Modules / ES6 Syntax)
- MongoDB with Mongoose

#### Frontend
- React.js
- Vite
- JavaScript (No TypeScript)
- Zustand (Use only when global state management is actually required.)
- React Router DOM (Latest Version)
- Tailwind CSS (Latest Version)
- Ant Design (Latest Version)

---

### Coding Standards

- Always write clean, readable, and production-ready code.
- Use ES6 Modules (`import` / `export`) everywhere.
- Follow the DRY (Don't Repeat Yourself) principle.
- Prefer functional programming where practical.
- Create reusable utilities, helpers, middleware, hooks, and components.
- Keep business logic separate from routing and UI.
- Use meaningful file, folder, variable, function, and component names.
- Keep code modular and easy to maintain.
- Never over-engineer solutions.
- Keep the project beginner-friendly without sacrificing production quality.

---

### Backend Folder Structure

Follow a modular architecture.

```
backend/
│
├── server.js
├── app.js
├── .env
├── .env.local
├── .env.example
│
└── src/
    │
    ├── config/
    ├── database/
    ├── modules/
    │   ├── auth/
    │   ├── user/
    │   ├── product/
    │   └── ...
    │
    ├── middlewares/
    ├── utils/
    ├── services/
    ├── constants/
    ├── validations/
    ├── helpers/
    ├── route.js
    └── index.js
```

---

### Backend Architecture Rules

- Keep **only** `server.js` and `app.js` outside the `src` folder.
- Everything else must remain inside `src`.
- Every feature should have its own module.
- Each module should contain its own:
  - controller
  - service
  - model
  - routes
  - validation
  - helper (if required)

Example:

```
modules/
    auth/
        auth.controller.js
        auth.service.js
        auth.model.js
        auth.routes.js
        auth.validation.js
```

---

### Backend Best Practices

- Centralized Error Handling.
- Global Error Middleware.
- Async Error Wrapper.
- Reusable Response Handler.
- Reusable Error Classes.
- Environment-based Configuration.
- Input Validation before Controller.
- Separate Business Logic from Controllers.
- Keep Controllers Thin.
- Services should contain Business Logic.
- Models should only handle Database Operations.

---

### Authentication

- Use HTTP-only Cookies for Authentication.
- Never store JWT in LocalStorage or SessionStorage.
- Cookies should use:
  - httpOnly
  - secure (when applicable)
  - sameSite
- Authentication should be production-ready.

---

### Environment Variables

Always maintain:

```
.env
.env.local
.env.example
```

Rules:

- Never hardcode secrets.
- Never commit `.env`.
- Every environment variable must be documented inside `.env.example`.

---

### API Structure

Use RESTful APIs.

Example:

```
GET
POST
PUT
PATCH
DELETE
```

Return consistent API responses.

Example:

```json
{
    "success": true,
    "message": "User created successfully",
    "data": {}
}
```

Error Example:

```json
{
    "success": false,
    "message": "Validation failed"
}
```

---

### Frontend Folder Structure

```
frontend/
│
├── .env
├── .env.local
├── .env.example
│
└── src/
    │
    ├── assets/
    ├── components/
    ├── layouts/
    ├── modules/
    ├── pages/
    ├── routes/
    ├── services/
    ├── hooks/
    ├── context/
    ├── store/
    ├── utils/
    ├── constants/
    ├── styles/
    ├── App.jsx
    └── main.jsx
```

---

### Frontend Architecture

Follow a modular architecture.

Each feature/module should contain its own:

- Components
- Pages
- API Calls
- Hooks
- Validation
- Utilities (if required)

Keep features isolated and reusable.

---

### Routing

Always use React Router DOM with the following structure.

```jsx
createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Layout />}>
      <Route index element={<Home />} />
      <Route path="about" element={<About />} />
      <Route path="contact" element={<Contact />} />
      <Route path="user/:userid" element={<User />} />
      <Route
        path="github"
        loader={githubInfoLoader}
        element={<Github />}
      />
    </Route>
  )
)
```

Do not use any other routing pattern unless specifically required.

---

### State Management

- Prefer React State whenever possible.
- Use Zustand only when global state is required.
- Do not introduce unnecessary global state.

---

### Styling

Use:

- Tailwind CSS (Latest Version)
- Ant Design (Latest Version)

Rules:

- Prefer Tailwind for layouts and utility styling.
- Use Ant Design for production-ready UI components.
- Keep UI responsive.
- Maintain consistent spacing, typography, and color usage.
- Avoid inline styles unless absolutely necessary.

---

### Component Guidelines

- Components should have a single responsibility.
- Keep components small and reusable.
- Extract repeated UI into reusable components.
- Avoid large monolithic components.

---

### Naming Convention

Use consistent naming throughout the project.

Examples:

```
user.controller.js
user.service.js
user.routes.js
user.model.js
user.validation.js
```

React Components:

```
UserCard.jsx
ProductList.jsx
LoginForm.jsx
```

Hooks:

```
useAuth.js
useProducts.js
```

---

### Code Quality Rules

Always:

- Write beginner-friendly code.
- Keep syntax explicit and readable.
- Avoid clever one-liners.
- Avoid unnecessary shorthand syntax.
- Avoid deeply nested logic.
- Use early returns whenever possible.
- Write self-explanatory code.
- Add professional comments only where necessary.
- Remove unused imports, variables, and files.

---

### Performance

- Optimize only when necessary.
- Use lazy loading where appropriate.
- Avoid unnecessary re-renders.
- Reuse components and utilities.
- Keep bundle size minimal.

---

### Documentation

Every reusable function should include a short description explaining:

- Purpose
- Parameters
- Return value (if applicable)

Complex logic should include professional comments explaining **why** the logic exists, not just **what** it does.

---

### Final Development Rules

Always prioritize the following, in order:

1. Readability
2. Simplicity
3. Maintainability
4. Reusability
5. Scalability
6. Performance

If two implementations achieve the same result, **always choose the one that is easier for the entire team to understand and maintain**, even if it requires a few extra lines of code.

- <!--------------------------------------------------------------------------------------->

### Code Quality Guidelines

#### Objective

Always write code that is simple, readable, maintainable, and production-ready. The code should be easy for any developer, including beginners, to understand and work with.

---

#### 1. Write Code That Is Easy to Understand

- Prioritize clarity over cleverness.
- A beginner developer should be able to understand the logic without needing extra explanation.
- Break complex logic into small, meaningful functions.
- Keep business logic straightforward.

---

#### 2. Write Readable Code

- Use meaningful and descriptive variable, function, and class names.
- Maintain consistent formatting and indentation.
- Keep functions focused on a single responsibility.
- Avoid unnecessary nesting whenever possible.
- Organize code in a logical order.

---

#### 3. Keep the Code Simple but Production-Ready

- Write clean, reliable, and scalable code.
- Do not over-engineer solutions.
- Follow industry best practices while keeping implementations simple.
- Focus on maintainability instead of unnecessary optimizations.

---

#### 4. Maintain a Clean Project Structure

- Organize files and folders logically.
- Separate concerns properly (UI, business logic, API, utilities, etc.).
- Keep related code together.
- Remove unused code, files, imports, and variables.

---

#### 5. Write Professional Comments

- Write comments only where they add value.
- Explain **why** something is done, not what obvious code already shows.
- Use clear and professional language.
- Add comments before complex logic when necessary.
- Avoid outdated or unnecessary comments.

Example:

```javascript
// Validate user permissions before allowing access to this resource.
```

---

#### 6. Use Simple and Explicit Syntax

- Always prefer easy-to-understand syntax.
- Avoid fancy, clever, or overly compact code.
- Do not use shortcuts that reduce readability.
- Avoid writing code that only experienced developers can understand.
- Expand logic when it improves readability.
- Write code that is easy for the entire team to maintain.

Preferred:

```javascript
if (user.isAdmin) {
  return true;
}

return false;
```

Avoid:

```javascript
return !!user?.isAdmin;
```

---

#### 7. Write Maintainable Code

- Keep files modular.
- Avoid duplicate code.
- Reuse components and utility functions where appropriate.
- Make future modifications easy.
- Follow consistent coding patterns throughout the project.

---

#### 8. Error Handling

- Handle all possible errors gracefully.
- Never ignore exceptions.
- Return meaningful error messages.
- Log errors where appropriate.
- Fail safely without crashing the application.

---

#### 9. Consistency

Always keep consistency in:

- Naming conventions
- Folder structure
- File organization
- Code formatting
- API patterns
- Component structure
- Function design

A consistent codebase is easier to understand and maintain.

---

#### 10. Performance

- Optimize only when necessary.
- Never sacrifice readability for minor performance gains.
- Avoid premature optimization.
- Write efficient but understandable code.

---

#### 11. Team-Friendly Development

Assume that multiple developers will work on this project.

Therefore:

- Write self-explanatory code.
- Keep logic predictable.
- Avoid surprising implementations.
- Make onboarding easy for new developers.
- Every file should be easy to navigate and modify.

---

#### Final Rule

When choosing between two implementations that produce the same result:

**Always choose the one that is easier to read, easier to understand, and easier to maintain.**

Never write code just because it is shorter.

Clarity always has higher priority than cleverness.
